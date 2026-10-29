// ============================================================
// PAYMENT SERVICE — provider-agnostic merchant POS orchestration
// ============================================================
function safeProviderResponse(result) {
  const message = typeof result?.message === 'string'
    ? result.message
        .replace(/\b(?:tok|pm|clv|sk|rk|pk)_[A-Za-z0-9_-]+\b/gi, '[redacted]')
        .replace(/\bpi_[A-Za-z0-9]+_secret_[A-Za-z0-9_-]+\b/gi, '[redacted]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
        .replace(/\b\d{12,19}\b/g, '[redacted]')
        .slice(0, 500)
    : null;
  return {
    transactionId: result?.transactionId || null,
    status: result?.status || null,
    providerStatus: result?.providerStatus || null,
    code: result?.providerCode || result?.code || null,
    message,
    amount: Number.isFinite(Number(result?.amount)) ? Number(result.amount) : null,
    currency: result?.currency || null,
  };
}

const ACTION_STATUSES = new Set(['requires_action', 'requires_confirmation', 'processing', 'pending']);
const { calculateCaptureAmount } = require('./ChargeCalculator');

function safeIdentifier(value, label, maxLength = 120) {
  if (value == null || value === '') return undefined;
  const stringValue = String(value).trim();
  if (stringValue.length > maxLength || !/^[A-Za-z0-9._:-]+$/.test(stringValue) || /^\d{12,19}$/.test(stringValue)) {
    throw Object.assign(new Error(`${label} geçersiz`), { statusCode: 400 });
  }
  return stringValue;
}

function safeMetadata(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 20) {
    throw Object.assign(new Error('metadata geçersiz'), { statusCode: 400 });
  }
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,39}$/.test(key) || /(pan|cvv|cvc|secret|password|token|otp|track|auth)/i.test(key)) {
      throw Object.assign(new Error('metadata alanı desteklenmiyor'), { statusCode: 400 });
    }
    const item = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : '';
    if (!item || item.length > 200 || /(?:\d[ -]?){12,19}/.test(item)) {
      throw Object.assign(new Error('metadata değeri geçersiz'), { statusCode: 400 });
    }
    output[key] = item;
  }
  return output;
}

function safeRedirectUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function publicProviderResult(result) {
  const status = result?.status || null;
  return {
    success: Boolean(result?.success),
    action: result?.action || null,
    status,
    providerStatus: result?.providerStatus || null,
    reason: result?.reason || null,
    providerCode: result?.providerCode || result?.code || null,
    message: safeProviderResponse(result).message,
    transactionId: result?.transactionId || result?.paymentId || null,
    amount: Number.isFinite(Number(result?.amount)) ? Number(result.amount) : null,
    currency: result?.currency || null,
    actionRequired: result?.requiresAction === true || ACTION_STATUSES.has(String(status || '').toLowerCase()),
    redirectUrl: safeRedirectUrl(result?.redirectUrl),
  };
}

class PaymentService {
  constructor(providers, dbService) {
    this.providers = providers || {};
    this.db = dbService;
  }

  _provider(key) {
    const provider = this.providers[String(key || '').toLowerCase()];
    if (!provider) throw new Error(`Provider bulunamadı: ${key}`);
    return provider;
  }

  _validateAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || n > 1000000) {
      throw new Error('Geçersiz tutar. 0 ile 1,000,000 arasında olmalı.');
    }
    return Math.round(n * 100) / 100;
  }

  async execute({ userId, requestId, providerKey, operation, paymentMethodId, amount, currency, enrollmentId, orderId, invoiceNumber, idempotencyKey, reason, description, metadata }) {
    if (!paymentMethodId) throw new Error('paymentMethodId gerekli');
    const value = this._validateAmount(amount);
    const provider = this._provider(providerKey);
    const started = Date.now();
    const safeOrderId = safeIdentifier(orderId, 'orderId');
    const safeInvoiceNumber = safeIdentifier(invoiceNumber, 'invoiceNumber');
    const safeKey = safeIdentifier(idempotencyKey || requestId, 'idempotencyKey');
    const safeDescription = description == null ? undefined : String(description).trim();
    if (safeDescription && (safeDescription.length > 250 || /(?:\d[ -]?){12,19}/.test(safeDescription))) {
      throw Object.assign(new Error('description geçersiz'), { statusCode: 400 });
    }
    const safeMeta = safeMetadata(metadata);

    // Check persistence before contacting a payment provider. This prevents a
    // known database outage from starting an operation that cannot be logged.
    try {
      await this.db.pool.query('SELECT 1');
    } catch (error) {
      console.error('[PAYMENT]', JSON.stringify({
        requestId: requestId || null,
        event: 'blocked_database_unavailable',
        userId,
        provider: providerKey,
        operation,
        code: error.code || 'DB_UNAVAILABLE',
      }));
      const unavailable = new Error('Veritabanı erişilemiyor; sağlayıcıya ödeme isteği gönderilmedi.');
      unavailable.statusCode = 503;
      unavailable.code = 'DB_UNAVAILABLE';
      throw unavailable;
    }

    const extra = {
      currency: provider.defaultCurrency || currency || 'USD',
      orderId: safeOrderId,
      invoiceNumber: safeInvoiceNumber,
      idempotencyKey: safeKey,
      reason,
      description: safeDescription,
      metadata: safeMeta,
    };

    const preAuth = provider.preAuth || provider.preauth;
    const method = operation === 'preauth' ? preAuth : provider[operation];
    if (typeof method !== 'function') {
      const unsupported = new Error(`${provider.name || providerKey} ${operation} işlemini desteklemiyor.`);
      unsupported.statusCode = 400;
      unsupported.code = 'OPERATION_UNSUPPORTED';
      throw unsupported;
    }

    let result;
    try {
      result = operation === 'preauth'
        ? await method.call(provider, paymentMethodId, value, null, extra)
        : operation === 'void'
          ? await method.call(provider, paymentMethodId, null, extra)
          : await method.call(provider, paymentMethodId, value, null, extra);
    } catch (error) {
      console.error('[PAYMENT]', JSON.stringify({
        requestId: requestId || null,
        event: 'provider_request_failed',
        userId,
        provider: providerKey,
        operation,
        code: error.code || error.type || 'PROVIDER_ERROR',
        durationMs: Date.now() - started,
      }));
      throw error;
    }

    const tx = await this.db.createMerchantTransaction({
      userId,
      enrollmentId,
      provider: providerKey,
      providerTransactionId: result?.transactionId || result?.paymentId || null,
      operation,
      status: result?.pending || ACTION_STATUSES.has(String(result?.status || '').toLowerCase())
        ? 'pending'
        : result?.status === 'captured'
          ? 'captured'
          : result?.status === 'error'
            ? 'error'
            : result?.success
              ? (operation === 'refund' ? 'refunded' : 'approved')
              : 'declined',
      amount: value,
      currency: result?.currency || extra.currency,
      orderId: safeOrderId,
      invoiceNumber: safeInvoiceNumber,
      idempotencyKey: safeKey,
      errorCode: result?.providerCode || null,
      errorMessage: safeProviderResponse(result).message,
      rawResponse: safeProviderResponse(result),
    });

    // A provider can approve before the local DB write fails. Keep that
    // provider result visible so the caller does not retry a successful sale.
    if (!tx) {
      console.error('[PAYMENT]', JSON.stringify({
        requestId: requestId || null,
        event: 'provider_result_not_recorded',
        userId,
        provider: providerKey,
        operation,
        durationMs: Date.now() - started,
      }));
      return {
        ...publicProviderResult(result),
        requestId: requestId || null,
        internalTransactionId: null,
        transactionRecorded: false,
        persistenceWarning: 'Provider yanıtı alındı ancak işlem kaydı yazılamadı. Yeniden ödeme başlatmadan işlem durumunu kontrol edin.',
        durationMs: Date.now() - started,
        provider: providerKey,
        operation,
      };
    }

    let provisionId = null;
    if (operation === 'preauth' && enrollmentId && result?.transactionId) {
      try {
        const networkRef = safeIdentifier(result.transactionId, 'provider transaction reference', 255);
        const provisionStatus = ACTION_STATUSES.has(String(result.status || '').toLowerCase())
          ? 'requires_action'
          : result.success ? 'open' : 'declined';
        const provision = await this.db.pool.query(
          `INSERT INTO provisions(user_id, card_enrollment_id, provider, network_ref,
                                  amount, currency, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [userId, enrollmentId, providerKey, networkRef, value, extra.currency, provisionStatus]
        );
        provisionId = provision.rows[0]?.id || null;
        if (provisionId) {
          await this.db.auditEvent(userId, 'provision.create', 'provision', provisionId, {
            provider: providerKey, status: provisionStatus, amount: value, currency: extra.currency,
          });
        }
      } catch (error) {
        console.error('[PAYMENT]', JSON.stringify({
          requestId: requestId || null,
          event: 'provision_record_failed',
          userId,
          provider: providerKey,
          code: error.code || 'PROVISION_RECORD_FAILED',
        }));
      }
    }

    try {
      await this.db.auditEvent(userId, `payments.${operation}`, 'merchant_transaction', tx.id, {
        provider: providerKey,
        status: tx.status,
        amount: value,
        currency: extra.currency,
      });
    } catch (_) {}

    console.info('[PAYMENT]', JSON.stringify({
      requestId: requestId || null,
      event: 'provider_result_recorded',
      userId,
      provider: providerKey,
      operation,
      status: tx.status,
      transactionId: tx.id,
      durationMs: Date.now() - started,
    }));

    const redirectUrl = safeRedirectUrl(result?.redirectUrl);
    const actionRequired = result?.requiresAction === true ||
      ACTION_STATUSES.has(String(result?.status || '').toLowerCase());
    return {
      success: Boolean(result?.success),
      status: result?.status || null,
      reason: result?.reason || null,
      providerCode: result?.providerCode || result?.code || null,
      message: safeProviderResponse(result).message,
      transactionId: result?.transactionId || result?.paymentId || null,
      actionRequired,
      redirectUrl,
      amount: Number.isFinite(Number(result?.amount)) ? Number(result.amount) : value,
      currency: result?.currency || extra.currency,
      requestId: requestId || null,
      internalTransactionId: tx.id,
      durationMs: Date.now() - started,
      provider: providerKey,
      operation,
      provisionId,
    };
  }

  async operateOnTransaction({ userId, requestId, transactionId, operation, amount, captureMode, reason, idempotencyKey }) {
    const started = Date.now();
    const q = await this.db.pool.query(
      `SELECT * FROM merchant_transactions WHERE id=$1 AND user_id=$2`,
      [transactionId, userId]
    );
    const tx = q.rows[0];
    if (!tx) throw new Error('İşlem bulunamadı');
    if (!tx.provider_transaction_id) throw new Error('Provider transaction ID bulunamadı');
    idempotencyKey = safeIdentifier(idempotencyKey || requestId, 'idempotencyKey');

    const provider = this._provider(tx.provider);
    const capabilities = typeof provider.capabilities === 'function'
      ? provider.capabilities()
      : provider.capabilities || {};
    const methodName = operation === 'void' ? 'voidTransaction' : operation;
    if (capabilities[operation] === false || typeof provider[methodName] !== 'function') {
      const unsupported = new Error(`${provider.name || tx.provider} ${operation} işlemini desteklemiyor.`);
      unsupported.statusCode = 400;
      unsupported.code = 'OPERATION_UNSUPPORTED';
      throw unsupported;
    }

    if (operation === 'capture') {
      if (tx.operation !== 'preauth' || tx.status !== 'approved') {
        throw new Error('Yalnızca onaylı ve capture edilmemiş POS provizyonu capture edilebilir.');
      }

      const calculated = calculateCaptureAmount(
        tx.amount,
        captureMode || (amount == null ? 'FULL_AUTH' : 'CUSTOM'),
        amount
      );
      const value = calculated.amount;

      // Atomic claim prevents two requests from capturing the same auth.
      const claim = await this.db.pool.query(
        `UPDATE merchant_transactions AS auth
            SET status='capture_pending', updated_at=NOW()
          WHERE auth.id=$1 AND auth.user_id=$2
            AND auth.operation='preauth' AND auth.status='approved'
            AND auth.provider_transaction_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM merchant_transactions AS child
               WHERE child.parent_transaction_id=auth.id
                 AND child.operation='capture'
                 AND child.status IN ('approved','captured','capture_pending')
            )
          RETURNING auth.*`,
        [transactionId, userId]
      );
      if (!claim.rowCount) {
        throw new Error('Bu provizyon zaten işleniyor veya capture edilmiş.');
      }

      const extra = {
        currency: tx.currency,
        reason,
        idempotencyKey: idempotencyKey || `capture-${tx.id}`,
        orderId: tx.order_id,
        invoiceNumber: tx.invoice_number,
      };

      let result;
      try {
        result = await provider.capture(tx.provider_transaction_id, value, null, extra);
      } catch (error) {
        // A transport failure may happen after the provider captured funds.
        // Leave the row locked for reconciliation instead of risking a retry.
        await this.db.pool.query(
          `UPDATE merchant_transactions SET status='capture_review', updated_at=NOW()
            WHERE id=$1 AND user_id=$2 AND status='capture_pending'`,
          [tx.id, userId]
        );
        throw new Error('Capture yanıtı belirsiz. Tekrar denemeden sağlayıcı işlem durumunu kontrol edin.');
      }

      const child = await this.db.createMerchantTransaction({
        userId,
        enrollmentId: tx.card_enrollment_id,
        provider: tx.provider,
        providerTransactionId: result?.transactionId || tx.provider_transaction_id,
        parentTransactionId: tx.id,
        operation: 'capture',
        status: result?.success ? 'captured' : 'declined',
        amount: value,
        currency: tx.currency,
        orderId: tx.order_id,
        invoiceNumber: tx.invoice_number,
        idempotencyKey: extra.idempotencyKey,
        errorCode: result?.providerCode || null,
        errorMessage: safeProviderResponse(result).message,
        rawResponse: safeProviderResponse(result),
      });

      await this.db.pool.query(
        `UPDATE merchant_transactions SET status=$3, updated_at=NOW()
          WHERE id=$1 AND user_id=$2 AND status='capture_pending'`,
        [tx.id, userId, result?.success ? 'captured' : 'approved']
      );

      if (result?.success) {
        const provisionUpdate = await this.db.pool.query(
          `UPDATE provisions
              SET captured_total=captured_total+$1, status='captured', updated_at=NOW()
            WHERE user_id=$2 AND provider=$3 AND network_ref=$4 AND status='open'
            RETURNING id`,
          [value, userId, tx.provider, tx.provider_transaction_id]
        );
        if (provisionUpdate.rowCount) {
          try {
            await this.db.auditEvent(userId, 'provision.capture', 'provision', provisionUpdate.rows[0].id, {
              provider: tx.provider, amount: value, currency: tx.currency,
            });
          } catch (_) {}
        }
      }

      if (child) {
        try {
          await this.db.auditEvent(userId, 'payments.capture', 'merchant_transaction', child.id, {
            provider: tx.provider,
            parentTransactionId: tx.id,
            status: child.status,
          });
        } catch (_) {}
      }

      console.info('[PAYMENT]', JSON.stringify({
        requestId: requestId || null,
        event: child ? 'transaction_action_recorded' : 'transaction_action_not_recorded',
        userId,
        provider: tx.provider,
        operation,
        parentTransactionId: tx.id,
        transactionId: child?.id || null,
        status: child?.status || (result?.success ? 'provider_approved' : 'provider_declined'),
        durationMs: Date.now() - started,
      }));

      return {
        ...publicProviderResult(result),
        requestId: requestId || null,
        internalTransactionId: child?.id || null,
        transactionRecorded: !!child,
        persistenceWarning: child ? null : 'Sağlayıcı yanıtı alındı ancak işlem kaydı yazılamadı. Tekrar denemeden sağlayıcı durumunu kontrol edin.',
        durationMs: Date.now() - started,
        parentTransactionId: tx.id,
        provider: tx.provider,
        operation,
      };
    }

    const value = amount == null ? Number(tx.amount) : this._validateAmount(amount);
    const extra = {
      currency: tx.currency,
      reason,
      idempotencyKey: idempotencyKey || requestId,
      orderId: tx.order_id,
      invoiceNumber: tx.invoice_number,
    };

    let result;
    if (operation === 'capture') result = await provider.capture(tx.provider_transaction_id, value, null, extra);
    else if (operation === 'refund') result = await provider.refund(tx.provider_transaction_id, value, null, extra);
    else if (operation === 'void') result = await provider.voidTransaction(tx.provider_transaction_id, null, extra);
    else throw new Error(`Desteklenmeyen operation: ${operation}`);

    const child = await this.db.createMerchantTransaction({
      userId,
      enrollmentId: tx.card_enrollment_id,
      provider: tx.provider,
      providerTransactionId: result?.transactionId || tx.provider_transaction_id,
      parentTransactionId: tx.id,
      operation,
      status: result?.success ? (operation === 'refund' ? 'refunded' : 'approved') : 'declined',
      amount: value,
      currency: tx.currency,
      orderId: tx.order_id,
      invoiceNumber: tx.invoice_number,
      idempotencyKey,
      errorCode: result?.providerCode || null,
      errorMessage: safeProviderResponse(result).message,
      rawResponse: safeProviderResponse(result),
    });

    if (child) {
      try {
        await this.db.auditEvent(userId, `payments.${operation}`, 'merchant_transaction', child.id, {
          provider: tx.provider,
          parentTransactionId: tx.id,
          status: child.status,
        });
      } catch (_) {}
    }

    if (operation === 'void' && result?.success) {
      const provisionUpdate = await this.db.pool.query(
        `UPDATE provisions SET status='voided', updated_at=NOW()
          WHERE user_id=$1 AND provider=$2 AND network_ref=$3 AND status='open'
          RETURNING id`,
        [userId, tx.provider, tx.provider_transaction_id]
      );
      if (provisionUpdate.rowCount) {
        try { await this.db.auditEvent(userId, 'provision.void', 'provision', provisionUpdate.rows[0].id, { provider: tx.provider }); } catch (_) {}
      }
    }

    console.info('[PAYMENT]', JSON.stringify({
      requestId: requestId || null,
      event: child ? 'transaction_action_recorded' : 'transaction_action_not_recorded',
      userId,
      provider: tx.provider,
      operation,
      parentTransactionId: tx.id,
      transactionId: child?.id || null,
      status: child?.status || (result?.success ? 'provider_approved' : 'provider_declined'),
      durationMs: Date.now() - started,
    }));

    return {
      success: Boolean(result?.success),
      status: result?.status || null,
      reason: result?.reason || null,
      providerCode: result?.providerCode || result?.code || null,
      message: safeProviderResponse(result).message,
      transactionId: result?.transactionId || null,
      amount: Number.isFinite(Number(result?.amount)) ? Number(result.amount) : null,
      currency: result?.currency || tx.currency,
      requestId: requestId || null,
      internalTransactionId: child?.id || null,
      transactionRecorded: !!child,
      persistenceWarning: child ? null : 'Sağlayıcı yanıtı alındı ancak işlem kaydı yazılamadı. Tekrar denemeden sağlayıcı durumunu kontrol edin.',
      parentTransactionId: tx.id,
      provider: tx.provider,
      operation,
    };
  }

  async refreshTransaction({ userId, requestId, transactionId }) {
    const started = Date.now();
    const q = await this.db.pool.query(
      `SELECT * FROM merchant_transactions WHERE id=$1 AND user_id=$2`,
      [transactionId, userId]
    );
    const tx = q.rows[0];
    if (!tx) throw new Error('İşlem bulunamadı');

    const provider = this._provider(tx.provider);
    if (typeof provider.getPaymentStatus !== 'function') {
      throw new Error(`${provider.name || tx.provider} işlem durumu sorgulamayı desteklemiyor.`);
    }

    const result = await provider.getPaymentStatus(tx.provider_transaction_id);
    const nextStatus = result?.status === 'error' && result?.providerStatus !== 'Failed'
      ? tx.status
      : result?.pending || ACTION_STATUSES.has(String(result?.status || '').toLowerCase())
      ? 'pending'
      : result?.status === 'captured'
        ? 'captured'
        : result?.status === 'voided'
          ? 'voided'
          : result?.status === 'canceled'
            ? 'canceled'
            : result?.status === 'error'
              ? 'error'
              : result?.success
                ? 'approved'
                : 'declined';

    await this.db.pool.query(
      `UPDATE merchant_transactions
          SET status=$3, error_code=$4, error_message=$5,
              raw_response=$6::jsonb, updated_at=NOW()
        WHERE id=$1 AND user_id=$2`,
      [
        tx.id,
        userId,
        nextStatus,
        result?.providerCode || null,
        result?.message || null,
        JSON.stringify(safeProviderResponse(result)),
      ]
    );

    if (tx.operation === 'preauth') {
      const provisionStatus = ACTION_STATUSES.has(String(result?.status || '').toLowerCase())
        ? 'requires_action'
        : nextStatus === 'approved' ? 'open'
          : nextStatus === 'voided' || nextStatus === 'canceled' ? 'voided'
            : nextStatus === 'declined' || nextStatus === 'error' ? 'declined'
              : 'pending';
      await this.db.pool.query(
        `UPDATE provisions SET status=$1, updated_at=NOW()
          WHERE user_id=$2 AND provider=$3 AND network_ref=$4`,
        [provisionStatus, userId, tx.provider, tx.provider_transaction_id]
      );
    }

    try {
      await this.db.auditEvent(userId, 'payments.status_refresh', 'merchant_transaction', tx.id, {
        provider: tx.provider,
        status: nextStatus,
      });
    } catch (_) {}

    console.info('[PAYMENT]', JSON.stringify({
      requestId: requestId || null,
      event: 'transaction_status_refreshed',
      userId,
      provider: tx.provider,
      transactionId: tx.id,
      status: nextStatus,
      durationMs: Date.now() - started,
    }));

    return {
      ...publicProviderResult(result),
      requestId: requestId || null,
      status: nextStatus,
      pending: nextStatus === 'pending',
      refreshError: result?.status === 'error' && result?.providerStatus !== 'Failed' ? result.message || result.reason : null,
      internalTransactionId: tx.id,
      provider: tx.provider,
      operation: tx.operation,
    };
  }

}

module.exports = PaymentService;
module.exports.safeRedirectUrl = safeRedirectUrl;
module.exports.publicProviderResult = publicProviderResult;
module.exports.safeIdentifier = safeIdentifier;
