const BaseProvider = require('../core/BaseProvider');

class NmiProvider extends BaseProvider {
  async verify(card) {
    const { config } = this;

    const params = new URLSearchParams({
      security_key: config.securityKey,
      type: 'validate',
      ccnumber: card.pan,
      ccexp: `${card.expMonth}${card.expYear.slice(-2)}`,
      cvv: card.cvv,
    });

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const text = await response.text();
    const parsed = Object.fromEntries(new URLSearchParams(text));

    if (parsed.response === '1') return { success: true, reason: 'approved', raw: parsed };

    if (parsed.response === '3') {
      const errText = (parsed.responsetext || '').toLowerCase();
      if (errText.includes('api key') || errText.includes('authentication')) {
        throw new Error(`PROVIDER_ERROR: ${parsed.responsetext}`);
      }
      return { success: false, reason: 'declined', raw: parsed };
    }

    if (parsed.response === '2') {
      const t = (parsed.responsetext || '').toLowerCase();
      if (t.includes('pick up') || t.includes('stolen'))
        return { success: false, reason: 'pick_up_card', raw: parsed };
      if (t.includes('invalid') || t.includes('cancelled'))
        return { success: false, reason: 'invalid_account', raw: parsed };
      return { success: false, reason: 'declined', raw: parsed };
    }

    return { success: false, reason: 'declined', raw: parsed };
  }

  extractChecks(raw) {
    return {
      cvc: raw.cvvresponse || null,
      avsAddress: raw.avsresponse || null,
      avsZip: raw.avsresponse || null,
      networkStatus: raw.responsetext || null,
    };
  }

  extractTransaction(raw) {
    return {
      authCode: raw.authcode || null,
      chargeId: raw.transactionid || null,
    };
  }
}

module.exports = NmiProvider;