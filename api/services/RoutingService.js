// ============================================================
// ROUTING SERVICE — Routing number'dan banka adı bul
// ============================================================
const fs = require('fs');
const path = require('path');

class RoutingService {
  constructor(csvPath) {
    this.csvPath = csvPath || path.join(__dirname, '..', 'data', 'routing_banks.csv');
    this.routingMap = new Map();
    this.cache = new Map();
    this.loadCsv();
  }

  loadCsv() {
    if (!fs.existsSync(this.csvPath)) {
      console.warn(`[ROUTING] CSV bulunamadı: ${this.csvPath}`);
      console.warn('[ROUTING] Harici API kullanılacak');
      return;
    }

    try {
      const content = fs.readFileSync(this.csvPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));

      for (const line of lines) {
        const [routing, bank_name, city, state] = line.split(',').map(s => s.trim());
        if (!routing || !bank_name) continue;
        if (!/^\d{9}$/.test(routing)) continue;

        this.routingMap.set(routing, {
          routing,
          bank_name,
          city: city || '',
          state: state || '',
        });
      }

      console.log(`[ROUTING] ${this.routingMap.size} banka yüklendi (CSV)`);
    } catch (e) {
      console.warn(`[ROUTING] CSV yükleme hatası: ${e.message}`);
    }
  }

  /**
   * Routing number doğrula (checksum)
   */
  validateRouting(routing) {
    if (!routing || !/^\d{9}$/.test(routing)) return false;

    // ABA checksum: 3*(d1+d4+d7) + 7*(d2+d5+d8) + 1*(d3+d6+d9) % 10 === 0
    const d = routing.split('').map(Number);
    const sum = 3 * (d[0] + d[3] + d[6])
              + 7 * (d[1] + d[4] + d[7])
              + 1 * (d[2] + d[5] + d[8]);
    return sum % 10 === 0;
  }

  /**
   * Routing number'dan banka bilgisi bul
   */
  async lookup(routing) {
    if (!routing || !/^\d{9}$/.test(routing)) {
      return { error: 'Routing number 9 hane olmalı' };
    }

    if (!this.validateRouting(routing)) {
      return { error: 'Geçersiz routing number (checksum hatası)' };
    }

    // Cache kontrolü
    if (this.cache.has(routing)) {
      return this.cache.get(routing);
    }

    // 1. Yerel CSV
    if (this.routingMap.has(routing)) {
      const result = this.routingMap.get(routing);
      this.cache.set(routing, result);
      return result;
    }

    // 2. Harici API (routingnumbers.info)
    try {
      const url = `https://www.routingnumbers.info/api/data.json?rn=${routing}`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();

        if (data.code === 200 && data.customer_name) {
          const result = {
            routing,
            bank_name: data.customer_name,
            city: data.city || '',
            state: data.state || '',
            address: data.address || '',
            zip: data.zip || '',
            telephone: data.telephone || '',
            source: 'api',
          };
          this.cache.set(routing, result);
          return result;
        }
      }
    } catch (e) {
      console.warn(`[ROUTING] API hatası: ${e.message}`);
    }

    // 3. Bulunamadı
    return {
      routing,
      bank_name: '',
      city: '',
      state: '',
      notFound: true,
    };
  }

  /**
   * Bulk lookup
   */
  async lookupMultiple(routings) {
    const results = {};
    for (const routing of routings) {
      results[routing] = await this.lookup(routing);
      await new Promise(r => setTimeout(r, 200)); // rate limit
    }
    return results;
  }
}

module.exports = RoutingService;
