const fs = require('fs');
const { parse: csvParse } = require('csv-parse/sync');

class BinDatabase {
  constructor(csvPath) {
    this.bins = new Map();
    this.csvPath = csvPath;
  }

  load() {
    if (!fs.existsSync(this.csvPath)) {
      console.warn(`[BIN] CSV bulunamadı: ${this.csvPath}`);
      return;
    }
    const content = fs.readFileSync(this.csvPath, 'utf-8');
    const records = csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    for (const row of records) {
      const bin = (row.BIN || row.bin || '').toString().padStart(6, '0');
      if (!/^\d{6}$/.test(bin)) continue;
      this.bins.set(bin, {
        bin,
        brand: row.Brand || row.brand || '',
        type: row.Type || row.type || '',
        category: row.Category || row.category || '',
        issuer: row.Issuer || row.issuer || row.Bank || row.bank || '',
        country: row.CountryName || row.country || row.Country || '',
        isoCode2: row.isoCode2 || row.ISO2 || '',
        isoCode3: row.isoCode3 || row.ISO3 || '',
      });
    }
    console.log(`[BIN] ${this.bins.size} kayıt yüklendi.`);
  }

  lookup(bin) {
    if (!bin || !/^\d{6}$/.test(bin)) return null;
    return this.bins.get(bin) || null;
  }

  async lookupWithFallback(bin, externalApi) {
    const local = this.lookup(bin);
    if (local && local.brand) return local;

    if (externalApi) {
      try {
        const url = externalApi.replace('{bin}', bin);
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          const external = {
            bin,
            brand: data.brand || data.scheme || '',
            type: data.type || data.card_type || '',
            category: data.category || data.level || '',
            issuer: data.issuer || data.bank || data.bank_name || '',
            country: data.country || data.country_name || '',
            isoCode2: data.isoCode2 || data.country_code || '',
            isoCode3: data.isoCode3 || '',
          };
          if (external.brand || external.issuer) return external;
        }
      } catch (e) {
        /* ignore */
      }
    }

    return (
      local || {
        bin, brand: '', type: '', category: '',
        issuer: '', country: '', isoCode2: '', isoCode3: '',
      }
    );
  }
}

module.exports = BinDatabase;