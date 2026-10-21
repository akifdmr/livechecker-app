// ============================================================
// AUTHORIZE.NET PROVIDER — Direct provider connection
// ============================================================
const BaseProvider = require('../core/BaseProvider');

class AuthorizeProvider extends BaseProvider {
  // ============================================================
  // HELPER: ORTAK REQUEST
  // ============================================================
  async _request(payload, _proxyStr, ctx = '') {
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    if (!rawText || rawText.trim() === '') {
      throw new Error(`PROVIDER_ERROR: Boş yanıt ${ctx ? `(${ctx})` : ''}`);
    }
    const cleanText = rawText.replace(/^\uFEFF/, '').trim();
    try {
      return JSON.parse(cleanText);
    } catch (e) {
      throw new Error(
        `PROVIDER_ERROR: JSON parse ${ctx ? `(${ctx})` : ''} - ${cleanText.substring(0, 200)}`
      );
    }
  }

  // ============================================================
  // HELPER: MESSAGES / ERROR KODLARI
  // ============================================================
  _parseMessages(data) {
    const messages = data.messages || {};
    const msgList = messages.message || [];
    const firstMsg = msgList[0] || {};
    const msgCode = String(firstMsg.code || '');
    return { messages, firstMsg, msgCode };
  }

  // ============================================================
  // PREAUTH — Belirli tutar için auth-only
  // ============================================================
  async preauth(card, amount, proxyStr = null) {
    const { config } = this;

    const payload = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: config.apiLoginId,
          transactionKey: config.transactionKey,
        },
        refId: `preauth-${this.key}-${Date.now()}`,
        transactionRequest: {
          transactionType: 'authOnlyTransaction',
          amount: Number(amount).toFixed(2),
          payment: {
            creditCard: {
              cardNumber: card.pan,
              expirationDate: `${card.expMonth}${String(card.expYear).slice(-2)}`,
              cardCode: card.cvv,
            },
          },
          billTo: {
            firstName: card.firstName || 'Test',
            lastName: card.lastName || 'User',
            address: card.address || '123 Main St',
            city: card.city || 'Anytown',
            state: card.state || 'CA',
            zip: card.zip || '12345',
            country: card.country || 'US',
            phoneNumber: card.phone || '5551234567',
          },
          customerIP: '127.0.0.1',
        },
      },
    };

    console.log(`[AUTH-${this.key}] ▶ preauth:`, {
      pan: card.pan.slice(0, 6) + '****' + card.pan.slice(-4),
      amount,
    });

    try {
      const data = await this._request(payload, proxyStr, 'preauth');
      const { messages, firstMsg, msgCode } = this._parseMessages(data);

      if (messages.resultCode === 'Error' || msgCode.startsWith('E000')) {
        if (['E00007', 'E00008', 'E00009'].includes(msgCode)) {
          throw new Error(`PROVIDER_ERROR: ${firstMsg.text}`);
        }
      }

      const result = data.transactionResponse || {};
      const responseCode = String(result.responseCode || '');
      const avsCode = String(result.avsResultCode || '').toUpperCase();
      const cvvCode = String(result.cvvResultCode || '').toUpperCase();

      const avsResult = this._evaluateAvs(avsCode, config.avsRules);
      const cvvResult = this._evaluateCvv(cvvCode, config.cvvRules);

      if (responseCode === '1') {
        // AVS/CVV reject kontrolü
        if (avsResult.status === 'reject') {
          return {
            success: false,
            reason: 'avs_rejected',
            providerCode: responseCode,
            message: `AVS reddedildi (${avsCode})`,
            avs: avsCode, avsMessage: avsResult.message, avsStatus: avsResult.status,
            cvv: cvvCode, cvvMessage: cvvResult.message, cvvStatus: cvvResult.status,
            transactionId: result.transId || null,
            raw: result,
          };
        }
        if (cvvResult.status === 'reject') {
          return {
            success: false,
            reason: 'cvv_rejected',
            providerCode: responseCode,
            message: `CVV reddedildi (${cvvCode})`,
            avs: avsCode, avsMessage: avsResult.message, avsStatus: avsResult.status,
            cvv: cvvCode, cvvMessage: cvvResult.message, cvvStatus: cvvResult.status,
            transactionId: result.transId || null,
            raw: result,
          };
        }

        return {
          success: true,
          reason: 'approved',
          providerCode: responseCode,
          avs: avsCode, avsMessage: avsResult.message, avsStatus: avsResult.status,
          cvv: cvvCode, cvvMessage: cvvResult.message, cvvStatus: cvvResult.status,
          authCode: result.authCode || null,
          transactionId: result.transId || null,
          message: result.messages?.[0]?.description || 'Approved',
          raw: result,
        };
      }

      if (responseCode === '2') {
        const reasonText = (result.responseReasonDescription || '').toLowerCase();
        let reason = 'declined';
        if (reasonText.includes('insufficient')) reason = 'insufficient_funds';
        else if (reasonText.includes('expired')) reason = 'expired_card';
        else if (reasonText.includes('invalid')) reason = 'invalid_account';
        else if (reasonText.includes('pick up') || reasonText.includes('stolen')) reason = 'pick_up_card';
        else if (reasonText.includes('cvv') || reasonText.includes('cvc')) reason = 'cvv_mismatch';

        // ⭐ providerCode artık her yerde set ediliyor
        return {
          success: false,
          reason,
          providerCode: responseCode,
          message: result.responseReasonDescription || null,
          avs: avsCode, avsMessage: avsResult.message, avsStatus: avsResult.status,
          cvv: cvvCode, cvvMessage: cvvResult.message, cvvStatus: cvvResult.status,
          raw: result,
        };
      }

      return {
        success: false,
        reason: 'declined',
        providerCode: responseCode || 'unknown',
        message: result.responseReasonDescription || 'Bilinmeyen',
        avs: avsCode, avsMessage: avsResult.message, avsStatus: avsResult.status,
        cvv: cvvCode, cvvMessage: cvvResult.message, cvvStatus: cvvResult.status,
        raw: result,
      };
    } catch (e) {
      if (e.message.startsWith('PROVIDER_ERROR:')) throw e;
      throw new Error(`PROVIDER_ERROR: Authorize preauth - ${e.message}`);
    }
  }

  // ============================================================
  // VERIFY — $0 doğrulama (Live Check)
  // ============================================================
  async verify(card, proxyStr = null) {
    const { config } = this;

    const payload = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: config.apiLoginId,
          transactionKey: config.transactionKey,
        },
        refId: `verify-${this.key}-${Date.now()}`,
        transactionRequest: {
          transactionType: 'authOnlyTransaction',
          amount: '0.00',
          payment: {
            creditCard: {
              cardNumber: card.pan,
              expirationDate: `${card.expMonth}${String(card.expYear).slice(-2)}`,
              cardCode: card.cvv,
            },
          },
          billTo: {
            firstName: card.firstName || 'Test',
            lastName: card.lastName || 'User',
            address: card.address || '123 Main St',
            city: card.city || 'Anytown',
            state: card.state || 'CA',
            zip: card.zip || '12345',
            country: card.country || 'US',
            phoneNumber: card.phone || '5551234567',
          },
          customerIP: '127.0.0.1',
        },
      },
    };

    console.log(`[AUTH-${this.key}] ▶ verify:`, {
      pan: card.pan.slice(0, 6) + '****' + card.pan.slice(-4),
    });

    try {
      const data = await this._request(payload, proxyStr, 'verify');
      const { messages, firstMsg, msgCode } = this._parseMessages(data);

      if (messages.resultCode === 'Error' || msgCode.startsWith('E000')) {
        if (['E00007', 'E00008', 'E00009'].includes(msgCode)) {
          throw new Error(`PROVIDER_ERROR: ${firstMsg.text}`);
        }
      }

      const result = data.transactionResponse || {};
      const responseCode = String(result.responseCode || '');
      const reasonText = (result.responseReasonDescription || '').toLowerCase();
      const errorCode = String(result.errors?.[0]?.errorCode || '');
      const errorText = result.errors?.[0]?.errorText || '';

      const avsCode = String(result.avsResultCode || '').toUpperCase();
      const cvvCode = String(result.cvvResultCode || '').toUpperCase();

      const avsResult = this._evaluateAvs(avsCode, config.avsRules);
      const cvvResult = this._evaluateCvv(cvvCode, config.cvvRules);

      if (errorCode === '30') {
        throw new Error(`PROVIDER_ERROR: ${errorText || 'errorCode 30'}`);
      }

      // responseCode 1 → APPROVED
      if (responseCode === '1') {
        if (avsResult.status === 'reject') {
          return this._buildResult(false, 'avs_rejected', avsCode, avsResult, cvvCode, cvvResult, result, responseCode);
        }
        if (cvvResult.status === 'reject') {
          return this._buildResult(false, 'cvv_rejected', avsCode, avsResult, cvvCode, cvvResult, result, responseCode);
        }
        return this._buildResult(true, 'approved', avsCode, avsResult, cvvCode, cvvResult, result, responseCode);
      }

      // responseCode 4 → HOLD FOR REVIEW
      if (responseCode === '4') {
        if (avsResult.status === 'reject') {
          return this._buildResult(false, 'avs_rejected', avsCode, avsResult, cvvCode, cvvResult, result, responseCode);
        }
        return this._buildResult(true, 'hold_for_review', avsCode, avsResult, cvvCode, cvvResult, result, responseCode);
      }

      // responseCode 2 → DECLINED
      if (responseCode === '2') {
        let reason = 'declined';
        if (reasonText.includes('pick up') || reasonText.includes('stolen')) reason = 'pick_up_card';
        else if (reasonText.includes('invalid') || reasonText.includes('cancelled')) reason = 'invalid_account';
        else if (reasonText.includes('insufficient')) reason = 'insufficient_funds';
        else if (reasonText.includes('expired')) reason = 'expired_card';
        else if (reasonText.includes('cvv') || reasonText.includes('cvc')) reason = 'cvv_mismatch';
        return this._buildResult(false, reason, avsCode, avsResult, cvvCode, cvvResult, result, responseCode);
      }

      // responseCode 3 → ERROR
      if (responseCode === '3') {
        const fullErrorText = (errorText || result.responseReasonDescription || '').toLowerCase();

        const errorCodeMap = {
          '7': 'expired_card',
          '8': 'expired_card',
          '11': 'duplicate_transaction',
          '30': 'transaction_not_accepted',
          '33': 'invalid_card_number',
          '290': 'missing_fields',
        };
        const unknownCodes = ['11', '30', '290'];

        if (unknownCodes.includes(errorCode)) {
          const reason = errorCodeMap[errorCode] || `error_${errorCode}`;
          return {
            success: false,
            reason,
            unknown: true,
            providerCode: errorCode,
            message: errorText || null,
            avs: avsCode, avsMessage: avsResult.message, avsStatus: avsResult.status,
            cvv: cvvCode, cvvMessage: cvvResult.message, cvvStatus: cvvResult.status,
            raw: result,
          };
        }

        let reason = 'declined';
        if (errorCodeMap[errorCode]) reason = errorCodeMap[errorCode];
        else if (fullErrorText.includes('expired')) reason = 'expired_card';
        else if (fullErrorText.includes('cvv') || fullErrorText.includes('cvc')) reason = 'cvv_mismatch';
        else if (fullErrorText.includes('invalid') || fullErrorText.includes('incorrect')) reason = 'invalid_account';
        else if (fullErrorText.includes('pick up') || fullErrorText.includes('stolen')) reason = 'pick_up_card';
        else if (fullErrorText.includes('insufficient')) reason = 'insufficient_funds';
        else if (fullErrorText) reason = `error_${fullErrorText.substring(0, 40).replace(/\s+/g, '_')}`;

        return this._buildResult(false, reason, avsCode, avsResult, cvvCode, cvvResult, result, errorCode || responseCode);
      }

      // A missing response code is a malformed provider response, not a
      // card decision. Keep genuine but unrecognized codes as UNKNOWN.
      const hasResponseCode = responseCode != null && String(responseCode).trim() !== '';
      return {
        success: false,
        reason: hasResponseCode ? `unknown_response_${String(responseCode).trim()}` : 'invalid_response',
        unknown: hasResponseCode,
        providerCode: hasResponseCode ? responseCode : null,
        raw: result,
      };
    } catch (e) {
      console.error(`[AUTH-${this.key}] 💥 verify CATCH: ${e.message}`);
      throw e;
    }
  }

  _buildResult(success, reason, avsCode, avsResult, cvvCode, cvvResult, raw, providerCode = null) {
    return {
      success,
      reason,
      providerCode,
      avs: avsCode,
      avsMessage: avsResult.message,
      avsStatus: avsResult.status,
      cvv: cvvCode,
      cvvMessage: cvvResult.message,
      cvvStatus: cvvResult.status,
      authCode: raw.authCode || null,
      transactionId: raw.transId || null,
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
    return {
      cvc: raw.cvvResultCode || null,
      avsAddress: raw.avsResultCode || null,
      avsZip: raw.avsResultCode || null,
      networkStatus: raw.messages?.[0]?.description || null,
    };
  }

  extractTransaction(raw) {
    return {
      authCode: raw.authCode || null,
      chargeId: raw.transId || null,
    };
  }

  // ============================================================
  // ⭐ CAPTURE — priorAuthCaptureTransaction
  // (preauth edilmiş işlemi capture eder)
  // ============================================================
  async capture(transId, amount, proxyStr = null) {
    const { config } = this;

    if (!transId) {
      return { success: false, message: 'transId gerekli', reason: 'missing_trans_id' };
    }

    const payload = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: config.apiLoginId,
          transactionKey: config.transactionKey,
        },
        refId: `capture-${this.key}-${Date.now()}`,
        transactionRequest: {
          transactionType: 'priorAuthCaptureTransaction',
          amount: Number(amount).toFixed(2),
          refTransId: String(transId),
        },
      },
    };

    console.log(`[AUTH-${this.key}] ▶ capture:`, { transId, amount });

    try {
      const data = await this._request(payload, proxyStr, 'capture');
      const { messages, firstMsg, msgCode } = this._parseMessages(data);
      const result = data.transactionResponse || {};
      const responseCode = String(result.responseCode || '');

      if (messages.resultCode === 'Error') {
        return {
          success: false,
          status: 'error',
          reason: 'provider_error',
          providerCode: msgCode || null,
          message: firstMsg.text || 'Capture API hatası',
          transactionId: null,
          raw: data,
        };
      }

      if (responseCode === '1') {
        return {
          success: true,
          status: 'captured',
          reason: 'approved',
          providerCode: responseCode,
          message: 'Capture başarılı',
          capturedAmount: Number(amount),
          transactionId: result.transId || null,
          raw: result,
        };
      }

      // responseCode 2 veya 3 → hata
      const reasonText = (result.responseReasonDescription || '').toLowerCase();
      const errText = result.errors?.[0]?.errorText || result.responseReasonDescription || null;
      const errCode = String(result.errors?.[0]?.errorCode || '');

      let reason = 'capture_failed';
      if (reasonText.includes('expired')) reason = 'expired_card';
      else if (reasonText.includes('not found') || reasonText.includes('invalid trans')) reason = 'invalid_transaction_id';
      else if (errCode === 'E00040') reason = 'transaction_not_found';

      return {
        success: false,
        status: 'error',
        reason,
        providerCode: errCode || responseCode,
        message: errText || 'Capture başarısız',
        transactionId: null,
        raw: result,
      };
    } catch (e) {
      console.error(`[AUTH-${this.key}] 💥 capture CATCH: ${e.message}`);
      return {
        success: false,
        status: 'error',
        reason: 'provider_error',
        message: `Authorize capture: ${e.message}`,
        transactionId: null,
      };
    }
  }

  // ============================================================
  // ⭐ REFUND — refundTransaction (linked veya standalone)
  // ============================================================
  async refund(transId, amount, proxyStr = null) {
    const { config } = this;

    if (!transId) {
      return { success: false, message: 'transId gerekli', reason: 'missing_trans_id' };
    }
    if (!amount || Number(amount) <= 0) {
      return { success: false, message: 'Geçersiz refund tutarı', reason: 'invalid_amount' };
    }

    const payload = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: config.apiLoginId,
          transactionKey: config.transactionKey,
        },
        refId: `refund-${this.key}-${Date.now()}`,
        transactionRequest: {
          transactionType: 'refundTransaction',
          amount: Number(amount).toFixed(2),
          // ⭐ Linked refund: sadece refTransId + amount yeterli
          refTransId: String(transId),
          // Bazı hesaplar son 4 + exp ister; güvenli tarafta kalıyoruz
          payment: {
            creditCard: {
              cardNumber: 'XXXX',
              expirationDate: 'XXXX',
            },
          },
        },
      },
    };

    console.log(`[AUTH-${this.key}] ▶ refund:`, { transId, amount });

    try {
      const data = await this._request(payload, proxyStr, 'refund');
      const { messages, firstMsg, msgCode } = this._parseMessages(data);
      const result = data.transactionResponse || {};
      const responseCode = String(result.responseCode || '');

      if (messages.resultCode === 'Error') {
        return {
          success: false,
          status: 'error',
          reason: 'provider_error',
          providerCode: msgCode || null,
          message: firstMsg.text || 'Refund API hatası',
          refundedAmount: 0,
          transactionId: null,
          raw: data,
        };
      }

      if (responseCode === '1') {
        return {
          success: true,
          status: 'refunded',
          reason: 'approved',
          providerCode: responseCode,
          message: 'Refund başarılı',
          refundedAmount: Number(amount),
          transactionId: result.transId || null,
          raw: result,
        };
      }

      const reasonText = (result.responseReasonDescription || '').toLowerCase();
      const errText = result.errors?.[0]?.errorText || result.responseReasonDescription || null;
      const errCode = String(result.errors?.[0]?.errorCode || '');

      let reason = 'refund_failed';
      if (reasonText.includes('settled')) reason = 'already_settled';
      else if (reasonText.includes('not found') || reasonText.includes('invalid trans')) reason = 'invalid_transaction_id';
      else if (errCode === 'E00040') reason = 'transaction_not_found';

      return {
        success: false,
        status: 'error',
        reason,
        providerCode: errCode || responseCode,
        message: errText || 'Refund başarısız',
        refundedAmount: 0,
        transactionId: null,
        raw: result,
      };
    } catch (e) {
      console.error(`[AUTH-${this.key}] 💥 refund CATCH: ${e.message}`);
      return {
        success: false,
        status: 'error',
        reason: 'provider_error',
        message: `Authorize refund: ${e.message}`,
        refundedAmount: 0,
        transactionId: null,
      };
    }
  }

  // ============================================================
  // VOID — voidTransaction (proxy + hata mesajı dönüşü)
  // ============================================================
  async voidTransaction(transId, proxyStr = null) {
    const { config } = this;

    if (!transId) {
      return { success: false, message: 'transId gerekli', reason: 'missing_trans_id' };
    }

    const payload = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: config.apiLoginId,
          transactionKey: config.transactionKey,
        },
        refId: `void-${this.key}-${Date.now()}`,
        transactionRequest: {
          transactionType: 'voidTransaction',
          refTransId: String(transId),
        },
      },
    };

    console.log(`[AUTH-${this.key}] ▶ void:`, { transId });

    try {
      const data = await this._request(payload, proxyStr, 'void');
      const { messages, firstMsg, msgCode } = this._parseMessages(data);
      const result = data.transactionResponse || {};
      const responseCode = String(result.responseCode || '');
      const success = responseCode === '1';

      // ⭐ API seviyesi hata (E00040 = transaction not found vb.)
      if (messages.resultCode === 'Error') {
        return {
          success: false,
          status: 'error',
          reason: 'provider_error',
          providerCode: msgCode || null,
          message: firstMsg.text || 'Void API hatası',
          transactionId: null,
          raw: data,
        };
      }

      if (success) {
        return {
          success: true,
          status: 'voided',
          reason: 'approved',
          providerCode: responseCode,
          message: 'Void başarılı',
          transactionId: result.transId || null,
          raw: result,
        };
      }

      // responseCode 2/3
      const errText = result.errors?.[0]?.errorText || result.responseReasonDescription || null;
      const errCode = String(result.errors?.[0]?.errorCode || '');

      return {
        success: false,
        status: 'error',
        reason: errCode === 'E00040' ? 'transaction_not_found' : 'void_failed',
        providerCode: errCode || responseCode,
        message: errText || 'Void başarısız',
        transactionId: null,
        raw: result,
      };
    } catch (e) {
      console.error(`[AUTH-${this.key}] 💥 void CATCH: ${e.message}`);
      return {
        success: false,
        status: 'error',
        reason: 'provider_error',
        message: `Authorize void: ${e.message}`,
        transactionId: null,
      };
    }
  }
}

module.exports = AuthorizeProvider;
