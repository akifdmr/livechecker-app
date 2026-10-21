const BaseProvider = require('../core/BaseProvider');
const braintree = require('braintree');

class BraintreeProvider extends BaseProvider {
  constructor(key, config) {
    super(key, config);

    this.gateway = new braintree.BraintreeGateway({
      environment:
        config.environment === 'production'
          ? braintree.Environment.Production
          : braintree.Environment.Sandbox,
      merchantId: config.merchantId,
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    });
  }

  async verify(card) {
    const { config } = this;

    try {
      // ============================================================
      // 1. İSTEK LOG
      // ============================================================
      console.log(`[BRAINTREE-${this.key}] ▶ İstek:`, {
        pan: card.pan.slice(0, 6) + '****' + card.pan.slice(-4),
        exp: `${card.expMonth}/${card.expYear.slice(-2)}`,
      });

      // ============================================================
      // 2. TRANSACTION.SALE
      //    - amount: 0.00 → auth only doğrulama
      //    - verifyCard: true → AVS/CVV doğrulaması + otomatik void
      // ============================================================
      const result = await this.gateway.transaction.sale({
  amount: '0.00',
  creditCard: {
    number: card.pan,
    expirationMonth: card.expMonth,
    expirationYear: card.expYear,
    cvv: card.cvv,
  },
  billing: {
    firstName: card.firstName || 'Test',
    lastName: card.lastName || 'User',
    streetAddress: card.address || '123 Main St',
    locality: card.city || 'Anytown',
    region: card.state || 'CA',
    postalCode: card.zip || '12345',
    countryCodeAlpha2: card.country || 'US',
  },
  customer: {
    firstName: card.firstName || 'Test',
    lastName: card.lastName || 'User',
  },
  // options bloğu tamamen silindi
});
      // ============================================================
      // 3. SUCCESS
      // ============================================================
      if (result.success) {
        const tx = result.transaction;

        const avsCode = String(tx.avsErrorResponseCode || '').toUpperCase();
        const cvvCode = String(tx.cvvResponseCode || '').toUpperCase();

        const avsResult = this._evaluateAvs(avsCode, config.avsRules || {});
        const cvvResult = this._evaluateCvv(cvvCode, config.cvvRules || {});

        console.log(`[BRAINTREE-${this.key}] Transaction:`, {
          status: tx.status,
          avsCode,
          cvvCode,
          transId: tx.id,
        });

        if (avsResult.status === 'reject') {
          return this._buildResult(false, 'avs_rejected', avsCode, avsResult, cvvCode, cvvResult, tx);
        }
        if (cvvResult.status === 'reject') {
          return this._buildResult(false, 'cvv_rejected', avsCode, avsResult, cvvCode, cvvResult, tx);
        }

        return this._buildResult(true, 'approved', avsCode, avsResult, cvvCode, cvvResult, tx);
      }

      // ============================================================
      // 4. FAILURE — Verification objesi
      // ============================================================
      const verification = result.verification;

      if (verification) {
        const status = verification.status; // processor_declined | gateway_rejected | failed
        const processorCode = String(verification.processorResponseCode || '');
        const processorText = String(verification.processorResponseText || '').toLowerCase();
        const gatewayReason = String(verification.gatewayRejectionReason || '').toLowerCase();

        const avsCode = String(verification.avsErrorResponseCode || '').toUpperCase();
        const cvvCode = String(verification.cvvResponseCode || '').toUpperCase();

        const avsResult = this._evaluateAvs(avsCode, config.avsRules || {});
        const cvvResult = this._evaluateCvv(cvvCode, config.cvvRules || {});

        console.log(`[BRAINTREE-${this.key}] Verification:`, {
          status,
          processorCode,
          processorText,
          gatewayReason,
          avsCode,
          cvvCode,
        });

        // ---- GATEWAY REJECTED (AVS/CVV kuralı) ----
        if (status === 'gateway_rejected') {
          if (gatewayReason.includes('cvv')) {
            return this._buildResult(false, 'cvv_rejected', avsCode, avsResult, cvvCode, cvvResult, verification);
          }
          if (gatewayReason.includes('avs')) {
            return this._buildResult(false, 'avs_rejected', avsCode, avsResult, cvvCode, cvvResult, verification);
          }
          return this._buildResult(
            false,
            `gateway_rejected_${gatewayReason || 'unknown'}`,
            avsCode, avsResult, cvvCode, cvvResult, verification
          );
        }

        // ---- PROCESSOR DECLINED (kart bazlı red) ----
        if (status === 'processor_declined') {
          let reason = 'declined';

          // Braintree processor response kodları
          // 2000 = Do Not Honor
          // 2001 = Insufficient Funds
          // 2002 = Limit Exceeded
          // 2003 = Cardholder's Activity Limit Exceeded
          // 2004 = Expired Card
          // 2005 = Invalid Credit Card Number
          // 2006 = Invalid Expiration Date
          // 2007 = No Account
          // 2008 = Card Account Length Exceeded
          // 2009 = Invalid Payment Type
          // 2010 = Invalid Card Type
          // 2011 = Invalid Card Type (2)
          // 2012 = Invalid Card Type (3)
          // 2013 = Invalid Card Type (4)
          // 2014 = Invalid Card Type (5)
          // 2015 = Invalid Card Type (6)
          // 2016 = Invalid Card Type (7)
          // 2017 = Invalid Card Type (8)
          // 2018 = Invalid Card Type (9)
          // 2019 = Invalid Card Type (10)
          // 2020 = Invalid Card Type (11)
          // 2021 = Invalid Card Type (12)
          // 2022 = Invalid Card Type (13)
          // 2023 = Invalid Card Type (14)
          // 2024 = Invalid Card Type (15)
          // 2025 = Invalid Card Type (16)
          // 2026 = Invalid Card Type (17)
          // 2027 = Invalid Card Type (18)
          // 2028 = Invalid Card Type (19)
          // 2029 = Invalid Card Type (20)
          // 2030 = Invalid Card Type (21)
          // 2031 = Invalid Card Type (22)
          // 2032 = Invalid Card Type (23)
          // 2033 = Invalid Card Type (24)
          // 2034 = Invalid Card Type (25)
          // 2035 = Invalid Card Type (26)
          // 2036 = Invalid Card Type (27)
          // 2037 = Invalid Card Type (28)
          // 2038 = Invalid Card Type (29)
          // 2039 = Invalid Card Type (30)
          // 2040 = Invalid Card Type (31)
          // 2041 = Invalid Card Type (32)
          // 2042 = Invalid Card Type (33)
          // 2043 = Invalid Card Type (34)
          // 2044 = Invalid Card Type (35)
          // 2045 = Invalid Card Type (36)
          // 2046 = Invalid Card Type (37)
          // 2047 = Invalid Card Type (38)
          // 2048 = Invalid Card Type (39)
          // 2049 = Invalid Card Type (40)
          // 2050 = Invalid Card Type (41)
          // 2051 = Invalid Card Type (42)
          // 2052 = Invalid Card Type (43)
          // 2053 = Invalid Card Type (44)
          // 2054 = Invalid Card Type (45)
          // 2055 = Invalid Card Type (46)
          // 2056 = Invalid Card Type (47)
          // 2057 = Invalid Card Type (48)
          // 2058 = Invalid Card Type (49)
          // 2059 = Invalid Card Type (50)
          // 2060 = Invalid Card Type (51)
          // 2061 = Invalid Card Type (52)
          // 2062 = Invalid Card Type (53)
          // 2063 = Invalid Card Type (54)
          // 2064 = Invalid Card Type (55)
          // 2065 = Invalid Card Type (56)
          // 2066 = Invalid Card Type (57)
          // 2067 = Invalid Card Type (58)
          // 2068 = Invalid Card Type (59)
          // 2069 = Invalid Card Type (60)
          // 2070 = Invalid Card Type (61)
          // 2071 = Invalid Card Type (62)
          // 2072 = Invalid Card Type (63)
          // 2073 = Invalid Card Type (64)
          // 2074 = Invalid Card Type (65)
          // 2075 = Invalid Card Type (66)
          // 2076 = Invalid Card Type (67)
          // 2077 = Invalid Card Type (68)
          // 2078 = Invalid Card Type (69)
          // 2079 = Invalid Card Type (70)
          // 2080 = Invalid Card Type (71)
          // 2081 = Invalid Card Type (72)
          // 2082 = Invalid Card Type (73)
          // 2083 = Invalid Card Type (74)
          // 2084 = Invalid Card Type (75)
          // 2085 = Invalid Card Type (76)
          // 2086 = Invalid Card Type (77)
          // 2087 = Invalid Card Type (78)
          // 2088 = Invalid Card Type (79)
          // 2089 = Invalid Card Type (80)
          // 2090 = Invalid Card Type (81)
          // 2091 = Invalid Card Type (82)
          // 2092 = Invalid Card Type (83)
          // 2093 = Invalid Card Type (84)
          // 2094 = Invalid Card Type (85)
          // 2095 = Invalid Card Type (86)
          // 2096 = Invalid Card Type (87)
          // 2097 = Invalid Card Type (88)
          // 2098 = Invalid Card Type (89)
          // 2099 = Invalid Card Type (90)

          // Yalnızca anlamlı olanları map'liyoruz
          const processorMap = {
            '2000': 'do_not_honor',
            '2001': 'insufficient_funds',
            '2002': 'limit_exceeded',
            '2003': 'activity_limit_exceeded',
            '2004': 'expired_card',
            '2005': 'invalid_card_number',
            '2006': 'invalid_expiration_date',
            '2007': 'no_account',
            '2008': 'account_length_exceeded',
            '2009': 'invalid_payment_type',
            '2010': 'invalid_card_type',
            '2011': 'invalid_card_type',
            '2012': 'invalid_card_type',
            '2013': 'invalid_card_type',
            '2014': 'invalid_card_type',
            '2015': 'invalid_card_type',
          };

          if (processorMap[processorCode]) {
            reason = processorMap[processorCode];
          } else if (processorText.includes('pick up') || processorText.includes('stolen')) {
            reason = 'pick_up_card';
          } else if (processorText.includes('expired')) {
            reason = 'expired_card';
          } else if (processorText.includes('invalid') || processorText.includes('incorrect')) {
            reason = 'invalid_account';
          } else if (processorText.includes('insufficient')) {
            reason = 'insufficient_funds';
          } else if (processorText.includes('do not honor')) {
            reason = 'do_not_honor';
          } else if (processorText.includes('cvv') || processorText.includes('cvc')) {
            reason = 'cvv_mismatch';
          } else if (processorCode) {
            reason = `processor_${processorCode}`;
          }

          return this._buildResult(false, reason, avsCode, avsResult, cvvCode, cvvResult, verification);
        }

        // ---- FAILED (network, timeout vb.) ----
        return {
          success: false,
          reason: `verification_failed_${processorCode || 'unknown'}`,
          unknown: true,
          avs: avsCode,
          avsMessage: avsResult.message,
          avsStatus: avsResult.status,
          cvv: cvvCode,
          cvvMessage: cvvResult.message,
          cvvStatus: cvvResult.status,
          raw: verification,
        };
      }

      // ============================================================
      // 5. SDK / VALIDATION ERROR
      // ============================================================
      if (result.message) {
        console.error(`[BRAINTREE-${this.key}] SDK Error:`, result.message);

        const msg = result.message.toLowerCase();
        let reason = 'sdk_error';

        if (msg.includes('expired')) reason = 'expired_card';
        else if (msg.includes('cvv') || msg.includes('cvc')) reason = 'cvv_mismatch';
        else if (msg.includes('invalid') || msg.includes('incorrect')) reason = 'invalid_card_number';
        else if (msg.includes('unsupported')) reason = 'unsupported_card';
        else reason = `sdk_${msg.substring(0, 40).replace(/\s+/g, '_')}`;

        // Validation hataları → UNKNOWN (kart ölü değil, veri eksik)
        const unknownReasons = ['sdk_error', 'unsupported_card'];
        const isUnknown = unknownReasons.includes(reason) || reason.startsWith('sdk_');

        return {
          success: false,
          reason,
          unknown: isUnknown,
          raw: result,
        };
      }

      // ============================================================
      // 6. BİLİNMEYEN
      // ============================================================
      return {
        success: false,
        reason: 'unknown_error',
        unknown: true,
        raw: result,
      };
    } catch (e) {
      console.error(`[BRAINTREE-${this.key}] 💥 CATCH: ${e.message}`);
      throw e;
    }
  }

  // ============================================================
  // YARDIMCI METOTLAR
  // ============================================================

  _buildResult(success, reason, avsCode, avsResult, cvvCode, cvvResult, raw) {
    return {
      success,
      reason,
      avs: avsCode,
      avsMessage: avsResult.message,
      avsStatus: avsResult.status,
      cvv: cvvCode,
      cvvMessage: cvvResult.message,
      cvvStatus: cvvResult.status,
      raw,
    };
  }

  _evaluateAvs(code, rules = {}) {
    const accept = rules.accept || [];
    const acceptPartial = rules.acceptPartial || [];
    const reject = rules.reject || [];
    const unknown = rules.unknown || [];

    if (!code) return { status: 'unknown', message: 'AVS sonucu yok' };

    if (accept.includes(code)) return { status: 'accept', message: this._avsMessage(code) };
    if (acceptPartial.includes(code)) return { status: 'accept_partial', message: this._avsMessage(code) };
    if (reject.includes(code)) return { status: 'reject', message: this._avsMessage(code) };
    if (unknown.includes(code)) return { status: 'unknown', message: this._avsMessage(code) };
    return { status: 'unknown', message: `AVS: ${code}` };
  }

  _evaluateCvv(code, rules = {}) {
    const accept = rules.accept || [];
    const reject = rules.reject || [];
    const unknown = rules.unknown || [];

    if (!code) return { status: 'unknown', message: 'CVV sonucu yok' };

    if (accept.includes(code)) return { status: 'accept', message: this._cvvMessage(code) };
    if (reject.includes(code)) return { status: 'reject', message: this._cvvMessage(code) };
    if (unknown.includes(code)) return { status: 'unknown', message: this._cvvMessage(code) };
    return { status: 'unknown', message: `CVV: ${code}` };
  }

  _avsMessage(code) {
    const map = {
      A: 'Sokak eşleşti, ZIP eşleşmedi',
      B: 'Sokak eşleşmedi, ZIP eşleşti (UK)',
      E: 'AVS hatası',
      G: 'ABD dışı kart, AVS yok',
      N: 'Hiç eşleşme yok',
      P: 'ZIP eşleşti',
      R: 'Tekrar dene — banka yanıt vermedi',
      S: 'AVS desteklenmiyor',
      U: 'Adres bilgisi yok',
      W: 'Sokak eşleşti (9 haneli), ZIP eşleşmedi',
      X: 'Sokak + ZIP eşleşti (9 haneli)',
      Y: 'Sokak + ZIP eşleşti (5 haneli)',
      Z: 'ZIP eşleşti (5 haneli), sokak eşleşmedi',
    };
    return map[code] || `AVS: ${code}`;
  }

  _cvvMessage(code) {
    const map = {
      M: 'CVV eşleşti',
      N: 'CVV eşleşmedi',
      P: 'CVV işlenmedi',
      S: 'CVV kartta olmalı ama belirtilmedi',
      U: 'Banka CVV işleyemedi',
    };
    return map[code] || `CVV: ${code}`;
  }

  extractChecks(raw) {
    if (!raw) return { cvc: null, avsAddress: null, avsZip: null, networkStatus: null };
    return {
      cvc: raw.cvvResponseCode || null,
      avsAddress: raw.avsStreetAddressResponseCode || raw.avsErrorResponseCode || null,
      avsZip: raw.avsPostalCodeResponseCode || raw.avsErrorResponseCode || null,
      networkStatus: raw.status || null,
    };
  }

  extractTransaction(raw) {
    if (!raw) return { authCode: null, chargeId: null };
    return {
      authCode: raw.authorizationCode || null,
      chargeId: raw.id || null,
    };
  }
}

module.exports = BraintreeProvider;