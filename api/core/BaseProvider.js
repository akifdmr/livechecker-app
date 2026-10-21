// core/BaseProvider.js
// ⭐ FIX: Hem `new P({key, config})` hem de `new P(key, config)` formunu destekler.
//    Eski hâlde tüm alt sınıflar `super(key, config)` çağırıyordu ama
//    BaseProvider tek argüman (opts objesi) bekliyordu → this.config = {} oluyordu.
class BaseProvider {
  constructor(optsOrKey = {}, maybeConfig) {
    let opts;
    if (typeof optsOrKey === 'string') {
      const cfg = maybeConfig || {};
      opts = {
        key: optsOrKey,
        name: cfg.name,
        type: cfg.type,
        config: cfg,
      };
    } else {
      opts = optsOrKey || {};
    }

    this.config = opts.config || {};
    this.key = opts.key || this.config.key || 'unknown';
    this.name = opts.name || this.config.name || 'Unknown Provider';
    this.type = opts.type || this.config.type || 'base';
  }

  async verify(_card, _proxyStr = null) {
    throw new Error(`verify() not implemented in ${this.name}`);
  }

  async voidTransaction(_transId, _proxyStr = null) {
    throw new Error(`voidTransaction() not implemented in ${this.name}`);
  }

  async complete(_transId, _finalAmount, _proxyStr = null) {
    throw new Error(`complete() not implemented in ${this.name}`);
  }

  extractChecks(_raw) {
    return { cvc: null, avsAddress: null, avsZip: null, networkStatus: null };
  }

  extractTransaction(_raw) {
    return { authCode: null, chargeId: null };
  }

  capabilities() {
    return {
      sale: typeof this.sale === 'function',
      preAuthorization: typeof this.preAuth === 'function' || typeof this.preauth === 'function',
      capture: typeof this.capture === 'function',
      refund: typeof this.refund === 'function',
      void: typeof this.voidTransaction === 'function',
      tokenizedPayment: false,
      terminalPayment: false,
      rawCardVerification: typeof this.verify === 'function',
    };
  }
}

module.exports = BaseProvider;