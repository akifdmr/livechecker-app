const BaseProvider = require('../core/BaseProvider');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ResinProvider extends BaseProvider {
  constructor(key, config) {
    super(key, config);
    this.scriptPath =
      config.scriptPath || path.join(__dirname, '..', 'selenium-check.py');
    this.timeout = config.timeout || 90000; // 90 saniye
  }

  /**
   * Tek kart check — timeout kontrollü
   */
  async verify(card) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.scriptPath)) {
        return reject(
          new Error(`PROVIDER_ERROR: ${this.scriptPath} bulunamadı`)
        );
      }

      const cardString = this._cardToString(card);
      const startTime = Date.now();

      console.log(`[RESIN-${this.key}] ▶ İstek:`, {
        pan: card.pan.slice(0, 6) + '****' + card.pan.slice(-4),
        exp: `${card.expMonth}/${card.expYear}`,
        timeout: `${this.timeout}ms`,
      });

      const py = spawn('python3', [this.scriptPath]);
      let stdout = '';
      let stderr = '';
      let killed = false;

      // ============================================================
      // TIMEOUT: Belirlenen sürede yanıt gelmezse process'i öldür
      // ============================================================
      const timeoutId = setTimeout(() => {
        killed = true;
        console.warn(
          `[RESIN-${this.key}] ⏱️ TIMEOUT (${this.timeout}ms) — process öldürülüyor`
        );

        try {
          py.kill('SIGKILL');
        } catch (e) {}

        reject(
          new Error(
            `PROVIDER_ERROR: Resin timeout (${this.timeout}ms aşıldı)`
          )
        );
      }, this.timeout);

      py.stdin.write(
        JSON.stringify({
          cards: [cardString],
          useProxy: this.config.useProxy || false,
        })
      );
      py.stdin.end();

      py.stderr.on('data', (data) => {
        const msg = data.toString();
        stderr += msg;
        const lines = msg.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          console.log(`[RESIN-${this.key}] STDERR:`, line.trim());
        }
      });

      py.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      py.on('error', (err) => {
        clearTimeout(timeoutId);
        console.error(`[RESIN-${this.key}] Spawn hatası:`, err.message);
        reject(
          new Error(`PROVIDER_ERROR: Python çalıştırılamadı - ${err.message}`)
        );
      });

      py.on('close', (code) => {
        clearTimeout(timeoutId);

        if (killed) return;

        const duration = Date.now() - startTime;

        if (code !== 0) {
          console.error(
            `[RESIN-${this.key}] Python exit code: ${code} (${duration}ms)`
          );
          return reject(
            new Error(
              `PROVIDER_ERROR: Python exit ${code} - ${stderr.substring(0, 300)}`
            )
          );
        }

        try {
          const result = JSON.parse(stdout);
          const firstResult = result.results?.[0];

          if (!firstResult) {
            return reject(new Error('PROVIDER_ERROR: Boş sonuç'));
          }

          const inner = firstResult.result || {};
          const parsed = this._classifyResult(inner);

          console.log(
            `[RESIN-${this.key}] ◀ Sonuç (${duration}ms):`,
            parsed
          );

          // response body'yi de kaydet
          resolve({
            ...parsed,
            raw: {
              ...inner,
              body: inner.body ? String(inner.body).substring(0, 1000) : null,
            },
          });
        } catch (e) {
          console.error(
            `[RESIN-${this.key}] Parse hatası:`,
            e.message
          );
          console.error(
            `[RESIN-${this.key}] stdout (ilk 300):`,
            stdout.substring(0, 300)
          );
          reject(new Error(`PROVIDER_ERROR: JSON parse - ${e.message}`));
        }
      });
    });
  }

  _cardToString(card) {
    const parts = [
      card.pan || '',
      card.expMonth || '',
      card.expYear || '',
      card.cvv || '',
      `${card.firstName || ''} ${card.lastName || ''}`.trim() || 'Test User',
      card.address || '123 Main St',
      card.city || 'Anytown',
      card.state || 'CA',
      card.zip || '12345',
      card.phone || '5551234567',
      card.email || 'test@example.com',
      card.country || 'US',
    ];
    return parts.join('|');
  }

  _classifyResult(inner) {
    // Timeout kontrolü
    if (inner.reason === 'no_response' || inner.reason === 'timeout') {
      return {
        success: false,
        reason: 'resin_timeout',
        unknown: true,
        provider: this.name,
        providerKey: this.key,
      };
    }

    if (inner.status === 'response') {
      const body = (inner.body || '').toLowerCase();
      if (
        body.includes('approved') ||
        body.includes('success') ||
        body.includes('"live"')
      ) {
        return {
          success: true,
          reason: 'approved',
          provider: this.name,
          providerKey: this.key,
        };
      }
      if (
        body.includes('declined') ||
        body.includes('failed') ||
        body.includes('"error"')
      ) {
        return {
          success: false,
          reason: 'declined',
          provider: this.name,
          providerKey: this.key,
        };
      }
      return {
        success: false,
        reason: 'unknown_response',
        unknown: true,
        provider: this.name,
        providerKey: this.key,
      };
    }

    if (inner.status === 'declined') {
      return {
        success: false,
        reason: inner.reason || 'card_verification_failed',
        provider: this.name,
        providerKey: this.key,
      };
    }

    if (inner.status === 'unknown') {
      return {
        success: false,
        reason: inner.reason || 'no_response',
        unknown: true,
        provider: this.name,
        providerKey: this.key,
      };
    }

    return {
      success: false,
      reason: inner.error || inner.reason || 'no_response',
      unknown: true,
      provider: this.name,
      providerKey: this.key,
    };
  }

  extractChecks(raw) {
    if (!raw) {
      return {
        cvc: null,
        avsAddress: null,
        avsZip: null,
        networkStatus: null,
      };
    }
    return {
      cvc: null,
      avsAddress: null,
      avsZip: null,
      networkStatus:
        typeof raw === 'string'
          ? raw.substring(0, 200)
          : raw.body
          ? String(raw.body).substring(0, 200)
          : null,
    };
  }

  extractTransaction(raw) {
    return { authCode: null, chargeId: null };
  }
}

module.exports = ResinProvider;