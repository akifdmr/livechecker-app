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

  async createSubscriptionCheckoutSession({ customerEmail, userId } = {}) {
    const unitAmount = Number(process.env.STRIPE_SUBSCRIPTION_UNIT_AMOUNT);
    const currency = String(process.env.STRIPE_SUBSCRIPTION_CURRENCY || 'usd').toLowerCase();
    const productName = String(process.env.STRIPE_SUBSCRIPTION_PRODUCT_NAME || '').trim();
    const interval = String(process.env.STRIPE_SUBSCRIPTION_INTERVAL || 'month').toLowerCase();
    const intervalCount = Number(process.env.STRIPE_SUBSCRIPTION_INTERVAL_COUNT || 1);
    const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL;
    const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL;

    const validHttpsUrl = (value) => {
      try { return new URL(value).protocol === 'https:'; }
      catch { return false; }
    };

    if (!Number.isSafeInteger(unitAmount) || unitAmount <= 0) {
      throw new Error('PROVIDER_ERROR: STRIPE_SUBSCRIPTION_UNIT_AMOUNT pozitif tam sayı olmalı (minor units)');
    }
    if (!/^[a-z]{3}$/.test(currency)) {
      throw new Error('PROVIDER_ERROR: STRIPE_SUBSCRIPTION_CURRENCY geçersiz');
    }
    if (!productName || productName.length > 120) {
      throw new Error('PROVIDER_ERROR: STRIPE_SUBSCRIPTION_PRODUCT_NAME gerekli (en fazla 120 karakter)');
    }
    if (!['day', 'week', 'month', 'year'].includes(interval) ||
        !Number.isSafeInteger(intervalCount) || intervalCount < 1 || intervalCount > 12) {
      throw new Error('PROVIDER_ERROR: Stripe recurring interval ayarları geçersiz');
    }
    if (!validHttpsUrl(successUrl) || !validHttpsUrl(cancelUrl)) {
      throw new Error('PROVIDER_ERROR: HTTPS STRIPE_CHECKOUT_SUCCESS_URL ve STRIPE_CHECKOUT_CANCEL_URL gerekli');
    }

    const session = await this._client().checkout.sessions.create({
      mode: 'subscription',
      ui_mode: 'hosted_page',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{
        price_data: {
          currency,
          product_data: { name: productName },
          unit_amount: unitAmount,
          recurring: { interval, interval_count: intervalCount },
        },
        quantity: 1,
      }],
      billing_address_collection: 'auto',
      payment_method_collection: 'always',
      allow_promotion_codes: false,
      submit_type: 'auto',
      integration_identifier: 'hosted_mobile_app_0002',
      origin_context: 'mobile_app',
      customer_email: customerEmail || undefined,
      client_reference_id: userId == null ? undefined : String(userId),
      metadata: userId == null ? undefined : { app_user_id: String(userId) },
    });

    return { id: session.id, url: session.url };
  }

  async getSubscriptionCheckoutStatus(sessionId, userId) {
    if (typeof sessionId !== 'string' || !/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
      throw new Error('PROVIDER_ERROR: Checkout session ID geçersiz');
    }
    const session = await this._client().checkout.sessions.retrieve(sessionId);
    const ownerId = session.client_reference_id || session.metadata?.app_user_id;
    if (String(ownerId || '') !== String(userId)) {
      const error = new Error('Checkout oturumu bulunamadı');
      error.statusCode = 404;
      throw error;
    }
    return {
      status: session.status,
      paymentStatus: session.payment_status,
      subscriptionCreated: Boolean(session.subscription),
    };
  }

  _result(intent, action) {
    const ok = ['succeeded','requires_capture'].includes(intent.status);
    const nextAction = intent.next_action || null;
    const redirectUrl = nextAction?.redirect_to_url?.url || null;
    return {
      success: ok,
      action,
      status: intent.status,
      requiresAction: intent.status === 'requires_action' || intent.status === 'requires_confirmation',
      actionType: nextAction?.type || null,
      redirectUrl,
      reason: ok ? 'approved' : (intent.last_payment_error?.code || intent.status),
      transactionId: intent.id,
      paymentIntentId: intent.id,
      authCode: null,
      providerCode: intent.last_payment_error?.decline_code || null,
      message: intent.last_payment_error?.message || null,
      raw: {
        id: intent.id,
        status: intent.status,
        amount: intent.amount,
        amount_received: intent.amount_received,
        currency: intent.currency,
        payment_method: intent.payment_method,
        next_action_type: nextAction?.type || null,
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

  async getPaymentStatus(paymentId) {
    if (!paymentId) throw new Error('PROVIDER_ERROR: paymentId gerekli');
    try {
      return this._result(await this._client().paymentIntents.retrieve(paymentId), 'status');
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
