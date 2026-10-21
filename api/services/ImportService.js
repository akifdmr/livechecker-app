// ============================================================
// services/ImportService.js
// Toplu kart check + smart import + NDJSON streaming
// + provider/operation aware checkStream
// ============================================================
const { luhnCheck } = require('../utils/luhn');
const { isExpired } = require('../utils/expiry');
const { maskPan } = require('../utils/mask');
const CardParser = require('./CardParser');

class ImportService {
  constructor(cardChecker, resinService, db) {
    this.cardChecker = cardChecker;
    this.resinService = resinService;
    this.db = db;
  }

  // ============================================================
  // KART AYIRMA (Smart import)
  // ============================================================
  splitCards(cards, routeCvvless) {
    const cvvCards = [];
    const cvvlessCards = [];
    const invalid = [];
    const expired = [];

    for (const raw of cards) {
      const parsed = CardParser.parseFull(raw);

      if (!parsed) {
        invalid.push({ raw, reason: 'format_error' });
        continue;
      }

      if (!luhnCheck(parsed.pan)) {
        invalid.push({ raw, parsed, reason: 'luhn_failed' });
        continue;
      }

      if (isExpired(parsed.expMonth, parsed.expYear)) {
        expired.push({ raw, parsed, reason: 'expired' });
        continue;
      }

      if (parsed.cvv && parsed.cvv.length >= 3) {
        cvvCards.push({ raw, parsed });
      } else if (routeCvvless) {
        cvvlessCards.push({ raw, parsed });
      } else {
        cvvCards.push({ raw, parsed });
      }
    }

    return { cvvCards, cvvlessCards, invalid, expired };
  }

  // ============================================================
  // SMART IMPORT
  // ============================================================
  async smartImport({ cards, routeCvvless, userId, res }) {
    const summary = {
      total: cards.length,
      live: 0,
      dead: 0,
      invalid: 0,
      expired: 0,
      error: 0,
      viaProvider: 0,
      viaResin: 0,
      savedToLiveCards: 0,
    };

    const { cvvCards, cvvlessCards, invalid, expired } = this.splitCards(
      cards,
      routeCvvless
    );

    for (const inv of invalid) {
      summary.invalid++;
      res.write(
        JSON.stringify({
          type: 'result',
          status: 'INVALID',
          reason: inv.reason,
          panMasked: inv.parsed ? maskPan(inv.parsed.pan) : 'unknown',
          source: 'parser',
        }) + '\n'
      );
    }
    for (const exp of expired) {
      summary.expired++;
      res.write(
        JSON.stringify({
          type: 'result',
          status: 'EXPIRED',
          reason: 'expired',
          panMasked: maskPan(exp.parsed.pan),
          source: 'parser',
        }) + '\n'
      );
    }

    res.write(
      JSON.stringify({
        type: 'start',
        total: cards.length,
        cvvCards: cvvCards.length,
        cvvlessCards: cvvlessCards.length,
        timestamp: new Date().toISOString(),
      }) + '\n'
    );

    const providerPromise = this._runProviderBatch(cvvCards, userId, res, summary);
    const resinPromise = routeCvvless
      ? this._runResinBatch(cvvlessCards, userId, res, summary)
      : Promise.resolve();

    await Promise.all([providerPromise, resinPromise]);

    return summary;
  }

  async _runProviderBatch(cards, userId, res, summary) {
    for (const { raw, parsed } of cards) {
      try {
        const enriched = await this.cardChecker.checkAndEnrich(parsed);
        let liveCardSaved = false;

        try {
          await this.db.saveCardCheck(userId, parsed, enriched);
          if (enriched.status === 'LIVE') {
            await this.db.saveLiveCardFull(userId, parsed, enriched, enriched.bin);
            liveCardSaved = true;
            summary.savedToLiveCards++;
          }
        } catch (dbErr) {
          console.error('[DB]', dbErr.message);
        }

        if (enriched.status === 'LIVE') summary.live++;
        else if (enriched.status === 'DEAD') summary.dead++;
        else if (enriched.status === 'ERROR') summary.error++;
        else if (enriched.status === 'UNKNOWN') summary.error++;
        summary.viaProvider++;

        res.write(
          JSON.stringify({
            type: 'result',
            index: summary.viaProvider,
            total: summary.total,
            source: 'provider',
            ...enriched,
            liveCardSaved,
          }) + '\n'
        );
      } catch (e) {
        summary.error++;
        res.write(
          JSON.stringify({
            type: 'result',
            source: 'provider',
            status: 'ERROR',
            reason: e.message,
            panMasked: maskPan(parsed.pan),
          }) + '\n'
        );
      }
    }
  }

  async _runResinBatch(cards, userId, res, summary) {
    if (cards.length === 0) return;

    const cardStrings = cards.map((c) => c.raw);

    try {
      await this.resinService.checkCards(cardStrings, async (event) => {
        if (event.type === 'log') {
          res.write(JSON.stringify(event) + '\n');
          return;
        }

        if (event.type === 'result') {
          summary.viaResin++;

          // BIN is passive issuer metadata. Look it up for every returned
          // result (including DEAD/ERROR) so it does not imply card status.
          const parsed = cards[summary.viaResin - 1]?.parsed;
          let binData = parsed
            ? { bin: parsed.pan.slice(0, 6), brand: parsed.brand || '' }
            : null;
          if (parsed) {
            try {
              binData = await this.cardChecker.binDb.lookupWithFallback(
                parsed.pan.slice(0, 6),
                this.cardChecker.externalApi
              ) || binData;
            } catch (binErr) {
              console.warn('[BIN-Resin]', binErr.message);
            }

            // Keep the check and its BIN metadata in the existing history
            // table. saveCardCheck stores PAN/CVV hashes, not their values.
            try {
              await this.db.saveCardCheck(userId, parsed, {
                status: event.status || 'ERROR',
                reason: event.reason || '',
                providerKey: 'resin',
                bin: binData,
                checks: {},
                transaction: {},
                duration: event.duration || 0,
              });
            } catch (dbErr) {
              console.error('[DB-Resin-check]', dbErr.message);
            }
          }

          if (event.status === 'LIVE') {
            summary.live++;

            if (parsed) {
              try {
                const enriched = {
                  pan: parsed.pan,
                  panMasked: maskPan(parsed.pan),
                  exp: `${parsed.expMonth}/${parsed.expYear}`,
                  cvv: parsed.cvv,
                  brand: parsed.brand,
                  status: 'LIVE',
                  reason: event.reason,
                  provider: 'Resin',
                  providerKey: 'resin',
                  bin: binData,
                  checks: {},
                  transaction: {},
                  raw: event.raw,
                };
                await this.db.saveLiveCardFull(userId, parsed, enriched, binData);
                summary.savedToLiveCards++;
              } catch (dbErr) {
                console.error('[DB-Resin]', dbErr.message);
              }
            }
          } else if (event.status === 'DEAD') {
            summary.dead++;
          } else {
            summary.error++;
          }

          res.write(
            JSON.stringify({
              type: 'result',
              index: summary.viaResin,
              total: summary.total,
              source: 'resin',
              status: event.status,
              reason: event.reason,
              panMasked: event.panMasked,
              bin: binData,
              liveCardSaved: event.status === 'LIVE',
            }) + '\n'
          );
        }
      });
    } catch (e) {
      res.write(
        JSON.stringify({
          type: 'error',
          source: 'resin',
          message: e.message,
        }) + '\n'
      );
    }
  }

  // ============================================================
  // ⭐ CHECK STREAM — provider + operation aware
  //    operation = 'live_check' | 'preauth'
  //    provider  = 'moneris' | 'clover3' | 'authorize3' | null (auto)
  //    amount    = sadece preauth için > 0
  // ============================================================
  async checkStream({
    cards,
    userId,
    res,
    provider = null,
    operation = 'live_check',
    amount = 0,
  }) {
    const summary = {
      total: cards.length,
      live: 0,
      dead: 0,
      invalid: 0,
      expired: 0,
      error: 0,
      savedToLiveCards: 0,
      provider: provider || 'auto',
      operation,
      amount: operation === 'preauth' ? amount : 0,
    };

    res.write(
      JSON.stringify({
        type: 'start',
        total: cards.length,
        provider: summary.provider,
        operation,
        amount: summary.amount,
        timestamp: new Date().toISOString(),
      }) + '\n'
    );

    for (let i = 0; i < cards.length; i++) {
      const cardStr = String(cards[i] || '').trim();
      const index = i + 1;

      if (!cardStr) continue;

      // ---- PARSE ----
      const parsed = CardParser.parseSimple(cardStr);

      if (!parsed) {
        summary.invalid++;
        res.write(
          JSON.stringify({
            type: 'result',
            index,
            total: cards.length,
            status: 'INVALID',
            reason: 'format_error',
            reasonShort: 'Geçersiz format',
            reasonLong: 'Kart satırı okunamadı.',
            provider: null,
          }) + '\n'
        );
        continue;
      }

      if (!luhnCheck(parsed.pan)) {
        summary.invalid++;
        res.write(
          JSON.stringify({
            type: 'result',
            index,
            total: cards.length,
            panMasked: maskPan(parsed.pan),
            status: 'INVALID',
            reason: 'luhn_failed',
            reasonShort: 'Luhn hatası',
            reasonLong: 'Kart numarası Luhn kontrolünden geçemedi.',
            provider: null,
          }) + '\n'
        );
        continue;
      }

      if (isExpired(parsed.expMonth, parsed.expYear)) {
        summary.expired++;
        res.write(
          JSON.stringify({
            type: 'result',
            index,
            total: cards.length,
            panMasked: maskPan(parsed.pan),
            status: 'EXPIRED',
            reason: 'expired',
            reasonShort: 'Süresi geçmiş',
            reasonLong: 'Kartın son kullanma tarihi geçmiş.',
            provider: null,
          }) + '\n'
        );
        continue;
      }

      // ---- İŞLEM ----
      try {
        let enriched;
        let authTxnId = null;
        let authTxnSaved = null;

        if (operation === 'preauth') {
          // ⭐ PREAUTH — provider-aware
          let r;
          if (provider) {
            r = await this.cardChecker.preAuthWithProvider(
              parsed,
              amount,
              provider
            );
          } else {
            r = await this.cardChecker.preAuth(parsed, amount);
          }

          const pKey =
            r.providerKey ||
            r.provider ||
            provider ||
            'auto';

          // Provider-aware preauth sonucu zaten success/reason/provider içeriyor
          const status = r.success
            ? 'LIVE'
            : r.reason === 'provider_error' ||
              r.reason === 'provider_timeout' ||
              r.reason === 'invalid_response' ||
              r.reason === 'network_error'
            ? 'ERROR'
            : 'DEAD';

          enriched = {
            pan: parsed.pan,
            panMasked: maskPan(parsed.pan),
            exp: `${parsed.expMonth}/${parsed.expYear}`,
            cvv: parsed.cvv,
            brand: parsed.brand,
            status,
            reason: r.reason || (r.success ? 'approved' : 'declined'),
            reasonShort: r.reasonShort || null,
            reasonLong: r.reasonLong || null,
            severity: r.severity || null,
            rawMessage: r.rawMessage || r.message || null,
            provider: r.provider || pKey,
            providerKey: pKey,
            providerCode: r.providerCode || null,
            authCode: r.authCode || null,
            transactionId: r.transactionId || null,
            duration: r.duration || 0,
            bin: {
              bin: parsed.pan.slice(0, 6),
              brand: parsed.brand || '',
              type: '',
              category: '',
              issuer: '',
              country: '',
              isoCode2: '',
              isoCode3: '',
            },
            checks: {},
            transaction: {
              authCode: r.authCode || null,
              chargeId: r.transactionId || null,
            },
            raw: r.raw || null,
          };

          // ⭐ Preauth kaydını DB'ye yaz (charge_audit)
          try {
            const savedTxn = await this.db.logProviderTransaction({
              userId,
              cardId: null,
              provider: pKey,
              action: 'auth',
              mode: 'live',
              amount,
              currency: 'USD',
              pan: parsed.pan,
              panMasked: enriched.panMasked,
              bin: parsed.pan.slice(0, 6),
              brand: parsed.brand || null,
              providerTxnId: r.transactionId || null,
              providerCode: r.providerCode || null,
              status: r.success ? 'approved' : 'declined',
              reason: enriched.reason,
              message: enriched.rawMessage || null,
              rawResponse: r.raw || null,
              durationMs: r.duration || 0,
            });
            authTxnSaved = savedTxn;
            authTxnId = savedTxn?.id || null;

            // Kart LIVE ise total_auth güncelle
            if (r.success) {
              await this.db.pool
                ?.query(
                  `UPDATE live_cards_full
                      SET total_auth = COALESCE(total_auth,0) + $2,
                          last_provider = $3,
                          last_auth_at = NOW(),
                          last_txn_at = NOW()
                    WHERE pan = $1 AND user_id = $4`,
                  [parsed.pan, amount, pKey, userId]
                )
                .catch(() => {});
            }
          } catch (dbErr) {
            console.warn('[DB] preauth log:', dbErr.message);
          }
        } else {
          // ---- LIVE CHECK ----
          if (provider) {
            const r = await this.cardChecker.verifyWithProvider(
              parsed,
              provider
            );
            enriched = this.cardChecker.enrichResult(parsed, r);
          } else {
            enriched = await this.cardChecker.checkAndEnrich(parsed);
          }
        }

        // `checkAndEnrich` performs this lookup already on the automatic
        // provider path. Add it explicitly for forced-provider checks and
        // preauth, which otherwise only know the six-digit prefix.
        if (operation === 'preauth' || provider) {
          const bin = parsed.pan.slice(0, 6);
          try {
            const metadata = await this.cardChecker.binDb.lookupWithFallback(
              bin,
              this.cardChecker.externalApi
            ) || {};
            enriched.bin = {
              bin,
              brand: metadata.brand || parsed.brand || '',
              type: metadata.type || '',
              category: metadata.category || '',
              issuer: metadata.issuer || '',
              country: metadata.country || '',
              isoCode2: metadata.isoCode2 || '',
              isoCode3: metadata.isoCode3 || '',
            };
          } catch (binError) {
            console.warn('[CHECK-STREAM] BIN metadata lookup:', binError.message);
            enriched.bin = { bin, brand: parsed.brand || '' };
          }
        }

        // ---- DB KAYIT (live_check ise) ----
        let liveCardSaved = false;
        if (operation === 'live_check') {
          try {
            await this.db.saveCardCheck(userId, parsed, enriched);
            if (enriched.status === 'LIVE') {
              await this.db.saveLiveCardFull(
                userId,
                parsed,
                enriched,
                enriched.bin
              );
              liveCardSaved = true;
              summary.savedToLiveCards++;
            }
          } catch (dbErr) {
            console.error('[DB] checkStream save:', dbErr.message);
          }
        } else if (operation === 'preauth' && enriched.status === 'LIVE') {
          // Preauth ise kart zaten live_cards_full'da olabilir; sadece işaretle
          liveCardSaved = true;
        }

        // ---- SAYAÇ ----
        if (enriched.status === 'LIVE') summary.live++;
        else if (enriched.status === 'DEAD') summary.dead++;
        else if (enriched.status === 'ERROR') summary.error++;
        else summary.error++;

        // ---- RESULT EVENT ----
        res.write(
          JSON.stringify({
            type: 'result',
            index,
            total: cards.length,
            pan: parsed.pan,
            panMasked: enriched.panMasked,
            exp: enriched.exp,
            cvv: enriched.cvv,
            status: enriched.status,
            reason: enriched.reason || 'unknown',
            reasonShort: enriched.reasonShort || null,
            reasonLong: enriched.reasonLong || null,
            severity: enriched.severity || null,
            rawMessage: enriched.rawMessage || null,
            provider: enriched.provider || enriched.providerKey || provider || null,
            providerKey: enriched.providerKey || provider || null,
            providerCode: enriched.providerCode || null,
            authCode: enriched.authCode || null,
            transactionId: enriched.transactionId || null,
            txnId: authTxnId,
            duration: enriched.duration || 0,
            avsMessage: enriched.avsMessage || enriched.checks?.avsMessage || null,
            avsStatus: enriched.avsStatus || enriched.checks?.avsStatus || null,
            cvvMessage: enriched.cvvMessage || enriched.checks?.cvvMessage || null,
            cvvStatus: enriched.cvvStatus || enriched.checks?.cvvStatus || null,
            bin: enriched.bin || { bin: parsed.pan.slice(0, 6) },
            liveCardSaved,
          }) + '\n'
        );
      } catch (e) {
        summary.error++;
        console.error(`[CHECK-STREAM] #${index}:`, e.message);
        res.write(
          JSON.stringify({
            type: 'result',
            index,
            total: cards.length,
            status: 'ERROR',
            reason: 'exception',
            reasonShort: 'İşlem hatası',
            reasonLong: e.message,
            provider: provider || null,
          }) + '\n'
        );
      }
    }

    return summary;
  }

  // ============================================================
  // IMPORT AND CHECK (eski endpoint)
  // ============================================================
  async importAndCheck({ cards, userId, res }) {
    const summary = {
      total: cards.length,
      live: 0,
      dead: 0,
      invalid: 0,
      expired: 0,
      error: 0,
      savedToLiveCards: 0,
    };

    res.write(
      JSON.stringify({
        type: 'start',
        total: cards.length,
        timestamp: new Date().toISOString(),
      }) + '\n'
    );

    for (let i = 0; i < cards.length; i++) {
      const parsed = CardParser.parseFull(cards[i]);

      if (!parsed) {
        summary.invalid++;
        res.write(
          JSON.stringify({
            type: 'result',
            index: i + 1,
            total: cards.length,
            status: 'INVALID',
            reason: 'format_error',
          }) + '\n'
        );
        continue;
      }

      if (!luhnCheck(parsed.pan)) {
        summary.invalid++;
        res.write(
          JSON.stringify({
            type: 'result',
            index: i + 1,
            total: cards.length,
            panMasked: maskPan(parsed.pan),
            status: 'INVALID',
            reason: 'luhn_failed',
          }) + '\n'
        );
        continue;
      }

      if (isExpired(parsed.expMonth, parsed.expYear)) {
        summary.expired++;
        res.write(
          JSON.stringify({
            type: 'result',
            index: i + 1,
            total: cards.length,
            panMasked: maskPan(parsed.pan),
            status: 'EXPIRED',
            reason: 'expired',
          }) + '\n'
        );
        continue;
      }

      try {
        const enriched = await this.cardChecker.checkAndEnrich(parsed);
        let liveCardSaved = false;

        try {
          await this.db.saveCardCheck(userId, parsed, enriched);
          if (enriched.status === 'LIVE') {
            await this.db.saveLiveCardFull(userId, parsed, enriched, enriched.bin);
            liveCardSaved = true;
            summary.savedToLiveCards++;
          }
        } catch (dbErr) {
          console.error('[DB]', dbErr.message);
        }

        if (enriched.status === 'LIVE') summary.live++;
        else if (enriched.status === 'DEAD') summary.dead++;
        else summary.error++;

        res.write(
          JSON.stringify({
            type: 'result',
            index: i + 1,
            total: cards.length,
            ...enriched,
            liveCardSaved,
          }) + '\n'
        );
      } catch (e) {
        summary.error++;
        res.write(
          JSON.stringify({
            type: 'result',
            index: i + 1,
            total: cards.length,
            status: 'ERROR',
            reason: e.message,
          }) + '\n'
        );
      }
    }

    return summary;
  }
}

module.exports = ImportService;
