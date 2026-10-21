// ============================================================
// STRIPE PROVIDER — tokenized PaymentIntent flow
// Raw PAN/CVV is intentionally not accepted by merchant endpoints.
// Use Stripe.js / Payment Element to create a PaymentMethod.
// ============================================================
const BaseProvider = require('../core/BaseProvider');
const Stripe = require('stripe');

class StripeProvider extends BaseProvider {
  _client() {
    const key = this.config.apiKey || process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('PROVIDER_ERROR: Stripe secret key missing');
    return new Stripe(key, { maxNetworkRetries: 2, timeout: 30000 });
  }

  _amount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new Error('PROVIDER_ERROR: invalid amount');
    return Math.round(n * 100);
  }

  _result(intent, action) {
    const ok = ['succeeded','requires_capture'].includes(intent.status);
    return {
      success: ok,
      action,
      status: intent.status,
      reason: ok ? 'approved' : (intent.last_payment_error?.code || intent.status),
      transactionId: intent.id,
      paymentIntentId: intent.id,
      authCode: null,
      providerCode: intent.last_payment_error?.decline_code || null,
      message: intent.last_payment_error?.message || null,
      clientSecret: intent.client_secret || null,
      raw: {
        id: intent.id,
        status: intent.status,
        amount: intent.amount,
        amount_received: intent.amount_received,
        currency: intent.currency,
        payment_method: intent.payment_method,
        last_payment_error: intent.last_payment_error || null,
      },
    };
  }

  async sale(paymentMethodId, amount, _proxy, extra = {}) {
    if (!paymentMethodId) throw new Error('PROVIDER_ERROR: paymentMethodId gerekli');
    const stripe = this._client();

    try {
      const intent = await stripe.paymentIntents.create({
        amount: this._amount(amount),
        currency: String(extra.currency || 'usd').toLowerCase(),
        payment_method: paymentMethodId,
        confirm: true,
        capture_method: 'automatic',
        description: extra.description || undefined,
        metadata: extra.metadata || {},
        receipt_email: extra.receiptEmail || undefined,
      }, {
        idempotencyKey: extra.idempotencyKey || undefined,
      });
      return this._result(intent, 'sale');
    } catch (err) {
      return this._error(err);
    }
  }

  async preAuth(paymentMethodId, amount, _proxy, extra = {}) {
    if (!paymentMethodId) throw new Error('PROVIDER_ERROR: paymentMethodId gerekli');
    const stripe = this._client();

    try {
      const intent = await stripe.paymentIntents.create({
        amount: this._amount(amount),
        currency: String(extra.currency || 'usd').toLowerCase(),
        payment_method: paymentMethodId,
        confirm: true,
        capture_method: 'manual',
        description: extra.description || undefined,
        metadata: extra.metadata || {},
      }, {
        idempotencyKey: extra.idempotencyKey || undefined,
      });
      return this._result(intent, 'preAuthorization');
    } catch (err) {
      return this._error(err);
    }
  }

  async capture(paymentId, amount, _proxy, extra = {}) {
    if (!paymentId) throw new Error('PROVIDER_ERROR: paymentId gerekli');
    try {
      const stripe = this._client();
      const params = {};
      if (amount != null && amount !== '') params.amount_to_capture = this._amount(amount);
      const intent = await stripe.paymentIntents.capture(paymentId, params, {
        idempotencyKey: extra.idempotencyKey || undefined,
      });
      return this._result(intent, 'capture');
    } catch (err) {
      return this._error(err);
    }
  }

  async refund(paymentId, amount, _proxy, extra = {}) {
    if (!paymentId) throw new Error('PROVIDER_ERROR: paymentId gerekli');
    try {
      const stripe = this._client();
      const refund = await stripe.refunds.create({
        payment_intent: paymentId,
        amount: this._amount(amount),
        reason: extra.reason || undefined,
      }, {
        idempotencyKey: extra.idempotencyKey || undefined,
      });
      const ok = refund.status === 'succeeded' || refund.status === 'pending';
      return {
        success: ok,
        action: 'refund',
        status: refund.status,
        reason: ok ? 'approved' : (refund.failure_reason || 'refund_failed'),
        transactionId: refund.id,
        paymentIntentId: paymentId,
        providerCode: refund.failure_reason || null,
        raw: { id: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency },
      };
    } catch (err) {
      return this._error(err);
    }
  }

  async voidTransaction(paymentId, _proxy, extra = {}) {
    if (!paymentId) throw new Error('PROVIDER_ERROR: paymentId gerekli');
    try {
      const intent = await this._client().paymentIntents.cancel(paymentId, {
        cancellation_reason: extra.reason || undefined,
      }, { idempotencyKey: extra.idempotencyKey || undefined });
      return this._result(intent, 'void');
    } catch (err) {
      return this._error(err);
    }
  }

  // Kept for legacy check route, but intentionally does not perform raw-card verification.
  async verify() {
    throw new Error('PROVIDER_ERROR: Stripe raw-card verification disabled; use tokenized PaymentIntent flow');
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
      requiresClientSideTokenization: true,
    };
  }

  _error(err) {
    const code = err.decline_code || err.code || err.type || 'provider_error';
    const message = err.message || 'Stripe error';
    if (err.type === 'StripeAuthenticationError') throw new Error(`PROVIDER_ERROR: Stripe auth - ${message}`);
    return {
      success: false,
      status: err.statusCode ? String(err.statusCode) : 'error',
      reason: code,
      providerCode: err.decline_code || err.code || null,
      message,
      raw: { type: err.type || null, code: err.code || null, decline_code: err.decline_code || null },
    };
  }
}

module.exports = StripeProvider;
