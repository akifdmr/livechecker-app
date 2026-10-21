require('dotenv').config();
const db = require('./db');

const API_KEYS = [
  // ---- Mevcut servisler (UPDATE) ----
  { service: 'shodan',        api_key: 'ud6lnt1rECYz9xDX3uem5hjicPo0MtTF',                                                api_url: 'https://api.shodan.io',                     key_required: 1 },
  { service: 'virustotal',    api_key: '3b7d433a111a506605fce243074d7b159a5815ed76949d5d1727543f43c229ee',                api_url: 'https://www.virustotal.com/api/v3',         key_required: 1 },
  { service: 'urlscan',       api_key: '019ca888-ea4f-71ed-bed2-0c38172fd226',                                            api_url: 'https://urlscan.io/api/v1',                  key_required: 1 },
  { service: 'abuseipdb',     api_key: 'a99c6a03dbfa8606f2520730a9ae6015200174c951ed87fe3eb6790fe8ef23a3b8fbae6e7ab8608e', api_url: 'https://api.abuseipdb.com/api/v2',           key_required: 1 },
  { service: 'greynoise',     api_key: '9d3fc42f-409a-461b-8f8c-1b10ffc1ac61',                                            api_url: 'https://api.greynoise.io/v3',                key_required: 1 },
  { service: 'github',        api_key: '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', api_url: 'https://api.github.com', key_required: 1 },
  { service: 'numverify',     api_key: '20506be34d9d6881596f300d6f655fed',                                                api_url: 'http://apilayer.net/api',                    key_required: 1 },

  // ---- Yeni servisler (INSERT) ----
  { service: 'intelbase',       api_key: 'in_QpZIaI14ivNDZ3JdYNp7',                                                       api_url: 'https://api.intelbase.is',                  key_required: 1 },
  { service: 'breachdirectory', api_key: '1863526f27msh4d8bdcf31dd1ad0p124cc2jsnb17280116547',                            api_url: 'https://breachdirectory.p.rapidapi.com',    key_required: 1 },
  { service: 'osintkit',        api_key: '0001f23cbc7be899e555b74d1c0baa18',                                              api_url: 'https://api.osintkit.net/v1',               key_required: 1 },
  { service: 'alienvault',      api_key: '7bf728af6aaae299d77c1fce622158d536359013fd693898555017e74de96a16',              api_url: 'https://otx.alienvault.com/api/v1',         key_required: 1 },
  { service: 'securitytrails',  api_key: 'W_UTkDGpffw1PyfoPdi7dKqCVI7ivh-h',                                              api_url: 'https://api.securitytrails.com/v1',         key_required: 1 },
  { service: 'censys',          api_key: 'censys_Ls7ZVfyn_FuKChA54okQvLYJVAh9Wknho',                                      api_url: 'https://search.censys.io/api/v2',           key_required: 1 },

  { service: 'abstract_email',  api_key: '458c1365d6b1413eb801fb224cbaafd6',                                              api_url: 'https://emailreputation.abstractapi.com/v1', key_required: 1 },
  { service: 'abstract_phone',  api_key: '31b8293d4bec4781a0625daa8029be75',                                              api_url: 'https://phoneintelligence.abstractapi.com/v1', key_required: 1 },
  { service: 'abstract_ip',     api_key: '1a87d167396449bb86ee4381147f5257',                                              api_url: 'https://ip-intelligence.abstractapi.com/v1', key_required: 1 },
  { service: 'abstract_iban',   api_key: 'cd097fac40b44fcfa21c5aef37181627',                                              api_url: 'https://ibanvalidation.abstractapi.com/v1',  key_required: 1 },

  { service: 'opencage',        api_key: '20e7090549e8401f8c70fca1cf667147',                                              api_url: 'https://api.opencagedata.com/geocode/v1/json', key_required: 1 },
  { service: 'ipgeolocation',   api_key: 'f51f45943c0c48848d6fcd1628b80a00',                                              api_url: 'https://api.ipgeolocation.io/ipgeo',         key_required: 1 },
  { service: 'sublime',         api_key: '1gohq8b3u6f3cfizn75peq6syj2fvyb164y8klafhtu74dqt1xkycndc7ka2y555',              api_url: 'https://eu.platform.sublime.security/v0',    key_required: 1 },

  // ---- Ücretsiz servisler ----
  { service: 'ipinfo',          api_key: null, api_url: 'https://ipinfo.io',                  key_required: 0 },
  { service: 'ipwhois',         api_key: null, api_url: 'https://ipwhois.app/json',           key_required: 0 },
  { service: 'bgpview',         api_key: null, api_url: 'https://api.bgpview.io',             key_required: 0 },
  { service: 'blockchain',      api_key: null, api_url: 'https://blockchain.info',            key_required: 0 },
  { service: 'geojs',           api_key: null, api_url: 'https://get.geojs.io/v1/ip/geo',      key_required: 0 },
];

(async () => {
  let inserted = 0, updated = 0;

  for (const item of API_KEYS) {
    try {
      const res = await db.pool.query(
        `INSERT INTO api_keys (service, api_key, api_url, key_required, is_active)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (service) DO UPDATE SET
           api_key = EXCLUDED.api_key,
           api_url = EXCLUDED.api_url,
           key_required = EXCLUDED.key_required,
           is_active = 1,
           updated_at = NOW()
         RETURNING (xmax = 0) AS is_insert`,
        [item.service, item.api_key, item.api_url, item.key_required]
      );

      if (res.rows[0].is_insert) {
        inserted++;
        console.log(`✅ INSERT: ${item.service}`);
      } else {
        updated++;
        console.log(`🔄 UPDATE: ${item.service}`);
      }
    } catch (e) {
      console.error(`❌ ${item.service}:`, e.message);
    }
  }

  console.log(`\n=== ÖZET ===`);
  console.log(`Yeni eklenen: ${inserted}`);
  console.log(`Güncellenen: ${updated}`);
  console.log(`Toplam: ${API_KEYS.length}`);

  // Kontrol
  const count = await db.pool.query('SELECT COUNT(*) FROM api_keys');
  console.log(`DB'de kayıtlı: ${count.rows[0].count}`);

  process.exit(0);
})();
