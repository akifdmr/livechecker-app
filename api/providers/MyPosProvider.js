const BaseProvider = require('../core/BaseProvider');
const {
  MyPOSGateway,
  DEMO_GATEWAY_URL,
  PRODUCTION_GATEWAY_URL,
} = require('mypos-api-gateway');

class MyPosProvider extends BaseProvider {
  constructor(key, config) {
    super(key, config);
    const gatewayUrl = config.environment === 'production'
      ? PRODUCTION_GATEWAY_URL
      : DEMO_GATEWAY_URL;

    this.gateway = new MyPOSGateway({
      gatewayUrl,
      integration: {
        clientId: config.integrationClientId,
        clientSecret: config.integrationClientSecret,
      },
      partnerId: config.partnerId,
      applicationId: config.applicationId,
      timeout: config.timeout || 30000,
    });
    this.client = this.gateway.createClient({
      clientId: config.merchantClientId,
      clientSecret: config.merchantClientSecret,
    });
    this.defaultTerminalId = config.terminalId;
    this.defaultCurrency = String(config.currency || 'EUR').toUpperCase();
  }

  _mapPayment(response, fallbackPaymentId = null) {
    if (!response?.success) {
      const err = response?.error || response?.data || response || {};
      return {
        success: false,
        status: 'declined',
        reason: err.code || err.title || 'provider_error',
        providerCode: err.code || err.status || null,
        message: err.detail || err.message || err.title || 'myPOS isteği başarısız oldu.',
        transactionId: fallbackPaymentId,
        raw: { error: err },
      };
    }

    const payment = response.data || {};
    const providerStatus = String(payment.status || 'Unknown');
    const statusMap = {
      InProgress: { status: 'pending', success: true, pending: true, reason: 'terminal_action_required' },
      Success: { status: 'captured', success: true, pending: false, reason: 'approved' },
      Canceled: { status: 'canceled', success: false, pending: false, reason: 'canceled' },
      Failed: { status: 'error', success: false, pending: false, reason: 'provider_error' },
      Reversed: { status: 'voided', success: false, pending: false, reason: 'reversed' },
      Rejected: { status: 'declined', success: false, pending: false, reason: 'declined' },
    };
    const mapped = statusMap[providerStatus] || {
      status: 'pending', success: true, pending: true, reason: 'status_pending',
    };

    return {
      ...mapped,
      providerStatus,
      currency: payment.amount?.currencyCode || this.defaultCurrency,
      transactionId: payment.paymentId || fallbackPaymentId,
      authCode: payment.authCode || null,
      providerCode: payment.responseCode || null,
      message: payment.statusMessage || null,
      raw: {
        paymentId: payment.paymentId || fallbackPaymentId,
        status: providerStatus,
        statusMessage: payment.statusMessage || null,
        responseCode: payment.responseCode || null,
        authCode: payment.authCode || null,
        referenceNumber: payment.referenceNumber || null,
        amount: payment.amount || null,
        createdAt: payment.createdAt || null,
        updatedAt: payment.updatedAt || null,
      },
    };
  }

  async sale(terminalId, amount, _proxy, extra = {}) {
    const targetTerminal = String(terminalId || this.defaultTerminalId || '').trim();
    const value = Number(amount);
    const currencyCode = this.defaultCurrency;
    if (!targetTerminal) return { success: false, reason: 'terminal_id_required', message: 'myPOS terminal ID gerekli.' };
    if (!/^\d{8}$/.test(targetTerminal)) return { success: false, reason: 'invalid_terminal_id', message: 'myPOS terminal ID 8 haneli olmalı.' };
    if (!Number.isFinite(value) || value <= 0) return { success: false, reason: 'invalid_amount', message: 'Tutar pozitif olmalı.' };

    try {
      const result = await this.client.epos.payments.create({
        amount: { value: Math.round(value * 100), currencyCode },
        terminalId: targetTerminal,
        appName: this.config.appName || 'Manager POS',
        appVersion: this.config.appVersion || '1.0.0',
        referenceNumber: String(extra.orderId || extra.invoiceNumber || '').slice(0, 50) || undefined,
        description: extra.description || undefined,
      });
      const mapped = this._mapPayment(result);
      if (mapped.success && !mapped.transactionId) {
        return {
          success: false,
          status: 'error',
          reason: 'missing_payment_id',
          message: 'myPOS ödeme isteği oluşturuldu ancak ödeme kimliği dönmedi; tekrar ödeme başlatmadan myPOS panelini kontrol edin.',
        };
      }
      return mapped;
    } catch (error) {
      return {
        success: false,
        status: 'error',
        reason: error.name || 'provider_error',
        message: error.message || 'myPOS bağlantı hatası.',
      };
    }
  }

  async getPaymentStatus(paymentId) {
    if (!paymentId) return { success: false, status: 'error', reason: 'payment_id_required' };
    try {
      const response = await this.client.epos.payments.get(String(paymentId));
      const mapped = this._mapPayment(response, String(paymentId));
      if (!response?.success) return { ...mapped, status: 'error', pending: false, providerStatus: null };
      return mapped;
    } catch (error) {
      return {
        success: false,
        status: 'error',
        reason: error.name || 'provider_error',
        message: error.message || 'myPOS işlem durumu alınamadı.',
        transactionId: String(paymentId),
      };
    }
  }

  capabilities() {
    return {
      sale: true,
      preAuthorization: false,
      capture: false,
      refund: false,
      void: false,
      tokenizedPayment: false,
      terminalPayment: true,
      paymentStatusQuery: true,
    };
  }
}

module.exports = MyPosProvider;
