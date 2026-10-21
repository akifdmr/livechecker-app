const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ResinService {
  constructor(scriptPath, proxyManager = null) {
    this.scriptPath = scriptPath || path.join(__dirname, '..', 'selenium-check.py');
    this.proxyManager = proxyManager;
  }

  async checkCards(cardStrings, onEvent) {
    if (!fs.existsSync(this.scriptPath)) {
      throw new Error(`selenium-check.py bulunamadı: ${this.scriptPath}`);
    }

    // Her kart için proxy ata
    const proxies = [];
    if (this.proxyManager) {
      for (let i = 0; i < cardStrings.length; i++) {
        const proxy = this.proxyManager.getNext();
        proxies.push(proxy ? proxy.raw : null);
      }
    }

    return new Promise((resolve, reject) => {
      const py = spawn('python3', [this.scriptPath]);
      let buffer = '';
      let stderrBuffer = '';

      // Kart + proxy listesi gönder
      py.stdin.write(JSON.stringify({
        cards: cardStrings,
        proxies: proxies       // ← YENİ: her kart için proxy
      }));
      py.stdin.end();

      py.stderr.on('data', (data) => {
        const msg = data.toString();
        stderrBuffer += msg;
        const lines = msg.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          onEvent({ type: 'log', source: 'resin', message: line.trim() });
        }
      });

      py.stdout.on('data', (data) => {
        buffer += data.toString();
      });

      py.on('error', (err) => {
        reject(new Error('Python spawn hatası: ' + err.message));
      });

      py.on('close', (code) => {
        if (code !== 0) {
          return reject(
            new Error(`Python exit code ${code}. stderr: ${stderrBuffer.substring(0, 500)}`)
          );
        }

        try {
          const result = JSON.parse(buffer);
          const results = result.results || [];

          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const parsed = this._classifyResult(r);
            const proxy = this.proxyManager ? this.proxyManager.getNext() : null;

            // Proxy health kaydet
            if (proxy) {
              if (parsed.status === 'LIVE' || parsed.status === 'DEAD') {
                this.proxyManager.recordSuccess(proxy);
              } else {
                this.proxyManager.recordFailure(proxy, parsed.status === 'UNKNOWN');
              }
            }

            onEvent({
              type: 'result',
              index: i + 1,
              total: results.length,
              source: 'resin',
              ...parsed,
              rawCard: r.card,
              proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
            });
          }

          const summary = {
            live: results.filter((r) => this._classifyResult(r).status === 'LIVE').length,
            dead: results.filter((r) => this._classifyResult(r).status === 'DEAD').length,
            unknown: results.filter((r) => this._classifyResult(r).status === 'UNKNOWN').length,
            total: results.length,
          };

          resolve({ results, summary });
        } catch (e) {
          reject(new Error('Python çıktısı parse edilemedi: ' + e.message));
        }
      });
    });
  }

  _classifyResult(r) {
    const inner = r.result || {};
    const panMasked = r.card
      ? r.card.substring(0, 6) + '****' + r.card.slice(-4)
      : 'unknown';

    if (inner.status === 'response') {
      const body = (inner.body || '').toLowerCase();
      if (body.includes('approved') || body.includes('success') || body.includes('"live"')) {
        return { status: 'LIVE', reason: 'approved', panMasked, raw: inner.body };
      }
      if (body.includes('declined') || body.includes('failed') || body.includes('"error"')) {
        return { status: 'DEAD', reason: 'declined', panMasked, raw: inner.body };
      }
      return { status: 'UNKNOWN', reason: 'unknown_response', panMasked, raw: inner.body };
    }

    if (inner.status === 'declined') {
      return {
        status: 'DEAD',
        reason: inner.reason || 'card_verification_failed',
        panMasked,
        raw: inner.body || null,
      };
    }

    return {
      status: 'UNKNOWN',
      reason: inner.error || inner.reason || 'no_response',
      panMasked,
      raw: null,
    };
  }
}

module.exports = ResinService;