// ============================================================
// PAYMENT SERVICE — provider-agnostic merchant POS orchestration
// ============================================================
function safeProviderResponse(result) {
  const message = typeof result?.message === 'string'
    ? result.message
        .replace(/\b(?:tok|pm|clv)_[A-Za-z0-9_-]+\b/gi, '[redacted]')
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
      orderId,
      invoiceNumber,
      idempotencyKey: idempotencyKey || requestId,
      reason,
      description,
      metadata,
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
      status: result?.pending
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
      orderId,
      invoiceNumber,
      idempotencyKey,
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
        ...result,
        requestId: requestId || null,
        internalTransactionId: null,
        transactionRecorded: false,
        persistenceWarning: 'Provider yanıtı alındı ancak işlem kaydı yazılamadı. Yeniden ödeme başlatmadan işlem durumunu kontrol edin.',
        durationMs: Date.now() - started,
        provider: providerKey,
        operation,
      };
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

    return {
      ...result,
      requestId: requestId || null,
      internalTransactionId: tx.id,
      durationMs: Date.now() - started,
      provider: providerKey,
      operation,
    };
  }

  async operateOnTransaction({ userId, requestId, transactionId, operation, amount, reason, idempotencyKey }) {
    const started = Date.now();
    const q = await this.db.pool.query(
      `SELECT * FROM merchant_transactions WHERE id=$1 AND user_id=$2`,
      [transactionId, userId]
    );
    const tx = q.rows[0];
    if (!tx) throw new Error('İşlem bulunamadı');
    if (!tx.provider_transaction_id) throw new Error('Provider transaction ID bulunamadı');

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

      const value = amount == null ? Number(tx.amount) : this._validateAmount(amount);
      if (value > Number(tx.amount)) {
        throw new Error('Capture tutarı provizyon tutarını aşamaz.');
      }

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
        ...result,
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
      ...result,
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
      : result?.pending
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
      ...result,
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
