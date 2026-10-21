// ============================================================
// MONERIS PROVIDER — Modern API, tokenized payment methods
// ============================================================
const BaseProvider = require('../core/BaseProvider');
const crypto = require('crypto');

class MonerisProvider extends BaseProvider {
  constructor(key, config) {
    super(key, config);
    this.baseUrl = (config.baseUrl || 'https://api.moneris.io').replace(/\/$/, '');
    this.sandboxBaseUrl = (config.sandboxBaseUrl || 'https://api.sb.moneris.io').replace(/\/$/, '');
    this.apiVersion = config.apiVersion || '2024-09-17';
    this.timeout = Number(config.timeout || 30000);
    this._token = null;
    this._tokenExpiresAt = 0;
  }

  _base() { return this.config.environment === 'sandbox' ? this.sandboxBaseUrl : this.baseUrl; }
  _idempotencyKey(v) { return v || crypto.randomUUID(); }

  _amount(amount, currency) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new Error('PROVIDER_ERROR: invalid amount');
    return { amount: Math.round(n * 100), currency: currency || this.config.currency || 'CAD' };
  }

  async _accessToken() {
    if (this.config.apiKey) return null;
    if (this._token && Date.now() < this._tokenExpiresAt) return this._token;

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('PROVIDER_ERROR: Moneris clientId/clientSecret missing');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: this.config.scope || 'payment.write',
    });

    const response = await fetch(`${this._base()}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(this.timeout),
    });
    const data = await this._json(response);
    if (!response.ok || !data.access_token) {
      throw new Error(`PROVIDER_ERROR: Moneris OAuth ${response.status}: ${data.detail || data.error || 'authentication failed'}`);
    }
    this._token = data.access_token;
    this._tokenExpiresAt = Date.now() + Math.max(30, Number(data.expires_in || 3600) - 60) * 1000;
    return this._token;
  }

  async _json(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); }
    catch (_) { throw new Error(`PROVIDER_ERROR: Moneris returned non-JSON (${response.status})`); }
  }

  async _request(path, method, body = undefined) {
    const token = await this._accessToken();
    const headers = {
      Accept: 'application/json',
      'Api-Version': this.apiVersion,
      'X-Merchant-Id': this.config.merchantId,
      'X-Correlation-Id': crypto.randomUUID(),
      'Content-Type': 'application/json',
    };
    if (!headers['X-Merchant-Id']) throw new Error('PROVIDER_ERROR: Moneris merchantId missing');
    if (this.config.apiKey) headers['X-API-Key'] = this.config.apiKey;
    else headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${this._base()}${path}`, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    const data = await this._json(response);
    if (!response.ok) {
      const err = new Error(`PROVIDER_ERROR: Moneris ${response.status}: ${data.detail || data.title || data.message || 'request failed'}`);
      err.providerCode = data.responseCode || data.isoResponseCode || null;
      err.raw = data;
      throw err;
    }
    return data;
  }

  _paymentMethod(input) {
    if (!input) throw new Error('PROVIDER_ERROR: payment method gerekli');

    const source = String(input.source || input.paymentMethodSource || '').toUpperCase();
    const id = input.paymentMethodId || input.externalPaymentMethodId || input.id;
    const token = input.temporaryToken || input.permanentToken;

    if (source === 'TEMPORARY_TOKEN' || input.temporaryToken) {
      return { paymentMethodSource: 'TEMPORARY_TOKEN', temporaryToken: token };
    }
    if (source === 'PERMANENT_TOKEN' || input.permanentToken) {
      return { paymentMethodSource: 'PERMANENT_TOKEN', permanentToken: token };
    }
    if (id) {
      return {
        paymentMethodSource: 'PAYMENT_METHOD_ID',
        paymentMethodId: id,
        storePaymentMethod: 'DO_NOT_STORE',
      };
    }
    throw new Error('PROVIDER_ERROR: Moneris payment method token missing');
  }


_normalize(data, action) {
  const payment = data.payment || data;
  const details =
    payment.transactionDetails ||
    data.transactionDetails ||
    {};

  const rawStatus = String(
    payment.paymentStatus ||
    data.paymentStatus ||
    payment.status ||
    data.status ||
    ''
  ).toUpperCase();

  const statusMap = {
    SUCCEEDED: 'captured',
    CAPTURED: 'captured',
    AUTHORIZED: 'authorized',
    APPROVED: 'approved',
    COMPLETED: action === 'refund' ? 'refunded' : 'captured',
    PENDING: 'pending',
    PROCESSING: 'pending',
    DECLINED: 'declined',
    FAILED: 'error',
    ERROR: 'error',
    VOIDED: 'voided',
    CANCELED: 'canceled',
    CANCELLED: 'canceled',
    REFUNDED: 'refunded',
  };

  const status = statusMap[rawStatus] || 'unknown';

  const success = [
    'captured',
    'authorized',
    'approved',
    'refunded',
    'voided',
  ].includes(status);

  const id =
    payment.paymentId ||
    payment.id ||
    data.paymentId ||
    data.id ||
    null;

  return {
    success,
    pending: status === 'pending',
    action,
    status,
    providerStatus: rawStatus || null,
    reason: success
      ? 'approved'
      : status === 'declined'
        ? 'declined'
        : status === 'unknown'
          ? 'unrecognized_status'
          : status,
    transactionId:
      id || details.transactionUniqueId || null,
    paymentId: id,
    authCode: details.authCode || null,
    providerCode:
      details.responseCode ||
      details.isoResponseCode ||
      null,
    message:
      details.message ||
      data.detail ||
      data.title ||
      data.message ||
      null,
    raw: data,
  };
}


  async sale(payment, amount, _proxy, extra = {}) {
    const method = typeof payment === 'string' ? { paymentMethodId: payment } : payment;
    const body = {
      idempotencyKey: this._idempotencyKey(extra.idempotencyKey),
      orderId: extra.orderId || `order_${Date.now()}_${crypto.randomUUID().slice(0,8)}`,
      invoiceNumber: extra.invoiceNumber || undefined,
      amount: this._amount(amount, extra.currency),
      paymentMethod: this._paymentMethod(method),
      ecommerceIndicator: extra.ecommerceIndicator || 'SSL_MERCHANT',
      automaticCapture: true,
      customData: extra.customData || undefined,
    };
    return this._normalize(await this._request('/payments', 'POST', body), 'purchase');
  }

  async purchase(payment, amount, proxy, extra) { return this.sale(payment, amount, proxy, extra); }

  async preAuth(payment, amount, _proxy, extra = {}) {
    const method = typeof payment === 'string' ? { paymentMethodId: payment } : payment;
    const body = {
      idempotencyKey: this._idempotencyKey(extra.idempotencyKey),
      orderId: extra.orderId || `order_${Date.now()}_${crypto.randomUUID().slice(0,8)}`,
      invoiceNumber: extra.invoiceNumber || undefined,
      amount: this._amount(amount, extra.currency),
      paymentMethod: this._paymentMethod(method),
      ecommerceIndicator: extra.ecommerceIndicator || 'SSL_MERCHANT',
      automaticCapture: false,
      customData: extra.customData || undefined,
    };
    return this._normalize(await this._request('/payments', 'POST', body), 'preAuthorization');
  }

  async preauth(payment, amount, proxy, extra) { return this.preAuth(payment, amount, proxy, extra); }

  async capture(paymentId, amount, _proxy, extra = {}) {
    if (!paymentId) throw new Error('PROVIDER_ERROR: paymentId gerekli');
    const body = {
      idempotencyKey: this._idempotencyKey(extra.idempotencyKey),
      invoiceNumber: extra.invoiceNumber || undefined,
      amount: amount ? this._amount(amount, extra.currency) : undefined,
      finalCompletion: extra.finalCompletion !== false,
    };
    return this._normalize(await this._request(`/payments/${encodeURIComponent(paymentId)}/complete`, 'POST', body), 'completion');
  }

  async refund(paymentId, amount, _proxy, extra = {}) {
    if (!paymentId) throw new Error('PROVIDER_ERROR: paymentId gerekli');
    const body = {
      paymentId,
      idempotencyKey: this._idempotencyKey(extra.idempotencyKey),
      invoiceNumber: extra.invoiceNumber || undefined,
      refundAmount: this._amount(amount, extra.currency),
      reason: extra.reason || undefined,
    };
    return this._normalize(await this._request('/refunds', 'POST', body), 'refund');
  }

  async voidTransaction(paymentId, _proxy, extra = {}) {
    if (!paymentId) throw new Error('PROVIDER_ERROR: paymentId gerekli');
    return this._normalize(
      await this._request(`/payments/${encodeURIComponent(paymentId)}/cancel`, 'POST', {
        idempotencyKey: this._idempotencyKey(extra.idempotencyKey),
        reason: extra.reason || undefined,
      }),
      'void'
    );
  }

  async void(paymentId, proxy, extra) { return this.voidTransaction(paymentId, proxy, extra); }

  async verify() {
    throw new Error('PROVIDER_ERROR: raw-card verification disabled; use Moneris Hosted Tokenization');
  }

  capabilities() {
    return {
      sale: true,
      preAuthorization: true,
      capture: true,
      refund: true,
      void: true,
      tokenizedPayment: true,
      rawCardVerification: false,
      hostedTokenization: true,
    };
  }
}

module.exports = MonerisProvider;
