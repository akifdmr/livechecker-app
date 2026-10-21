const fs = require('fs');
const path = require('path');

class ProxyManager {
  constructor(proxyFilePath) {
    this.proxyFilePath = proxyFilePath || path.join(__dirname, '..', 'proxies.txt');
    this.proxies = [];           // { host, port, user, pass, raw, health: {} }
    this.currentIndex = 0;
    this.deadProxies = new Set(); // Ölü proxy'lerin raw string'leri
    this.load();
  }

  load() {
    if (!fs.existsSync(this.proxyFilePath)) {
      console.warn(`[PROXY] proxies.txt bulunamadı: ${this.proxyFilePath}`);
      return;
    }

    const content = fs.readFileSync(this.proxyFilePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length !== 4) continue;

      this.proxies.push({
        host: parts[0],
        port: parts[1],
        user: parts[2],
        pass: parts[3],
        raw: line,
        health: { success: 0, fail: 0, consecutiveFail: 0, lastUsed: 0 }
      });
    }

    console.log(`[PROXY] ${this.proxies.length} proxy yüklendi.`);
  }

  /**
   * Sıradaki proxy'i döndür (round-robin)
   */
  getNext() {
    if (this.proxies.length === 0) return null;

    // Ölü olmayanları filtrele
    const alive = this.proxies.filter(p => !this.deadProxies.has(p.raw));
    if (alive.length === 0) {
      console.warn('[PROXY] Tüm proxy\'ler ölü! Sıfırlanıyor...');
      this.deadProxies.clear();
      return this.proxies[this.currentIndex++ % this.proxies.length];
    }

    const proxy = alive[this.currentIndex++ % alive.length];
    proxy.health.lastUsed = Date.now();
    return proxy;
  }

  /**
   * Rastgele proxy
   */
  getRandom() {
    const alive = this.proxies.filter(p => !this.deadProxies.has(p.raw));
    if (alive.length === 0) return null;
    return alive[Math.floor(Math.random() * alive.length)];
  }

  /**
   * Proxy başarılı oldu
   */
  recordSuccess(proxy) {
    if (!proxy) return;
    proxy.health.success++;
    proxy.health.consecutiveFail = 0;
  }

  /**
   * Proxy başarısız oldu
   */
  recordFailure(proxy, isFatal = false) {
    if (!proxy) return;
    proxy.health.fail++;
    proxy.health.consecutiveFail++;

    // 3 kez üst üste hata → ölü işaretle
    if (isFatal || proxy.health.consecutiveFail >= 3) {
      this.deadProxies.add(proxy.raw);
      console.warn(`[PROXY] ${proxy.host}:${proxy.port} ölü olarak işaretlendi (${proxy.health.consecutiveFail} hata)`);
    }
  }

  /**
   * Belirli bir proxy'i formatla (Puppeteer/Selenium için)
   */
  formatForSelenium(proxy) {
    if (!proxy) return null;
    return `http://${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`;
  }

  /**
   * Fetch için proxy header'ı
   */
  formatForFetch(proxy) {
    if (!proxy) return null;
    return `${proxy.user}:${proxy.pass}@${proxy.host}:${proxy.port}`;
  }

  /**
   * Kaç proxy kaldı?
   */
  stats() {
    const alive = this.proxies.filter(p => !this.deadProxies.has(p.raw)).length;
    return {
      total: this.proxies.length,
      alive,
      dead: this.deadProxies.size
    };
  }

  /**
   * Ölü proxy'leri sıfırla
   */
  reset() {
    this.deadProxies.clear();
    console.log('[PROXY] Ölü proxy listesi sıfırlandı');
  }
}

module.exports = ProxyManager;