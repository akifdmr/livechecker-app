// core/ProviderFactory.js
const AuthorizeProvider = require('../providers/AuthorizeProvider');
const CloverProvider = require('../providers/CloverProvider');
const NmiProvider = require('../providers/NmiProvider');
const ResinProvider = require('../providers/ResinProvider');
const BraintreeProvider = require('../providers/BraintreeProvider');
const StripeProvider = require('../providers/StripeProvider');
const MonerisProvider = require('../providers/MonerisProvider');
const MyPosProvider = require('../providers/MyPosProvider');
const ProviderHealth = require('./ProviderHealth');
const { providerConfigEntries } = require('../utils/providerConfigEntries');

const PROVIDER_CLASSES = {
  authorize: AuthorizeProvider,
  clover: CloverProvider,
  nmi: NmiProvider,
  resin: ResinProvider,
  braintree: BraintreeProvider,
  stripe: StripeProvider,
  moneris: MonerisProvider,
  mypos: MyPosProvider,
};

class ProviderFactory {

static create(key, config) {
  if (!config || !config.type) {
    throw new Error(`Provider type eksik: ${key}`);
  }

  const type = String(config.type).toLowerCase();
  const ProviderClass = PROVIDER_CLASSES[type];

  if (!ProviderClass) {
    throw new Error(`Bilinmeyen provider tipi: ${type}`);
  }

  const normalizedConfig = {
    ...config,
    type,
  };

  const provider = new ProviderClass(key, normalizedConfig);

  // Legacy constructor kullanan sınıflar için ortak alanları garanti et.
  provider.key = key;
  provider.type = type;
  provider.config = normalizedConfig;
  provider.name =
    normalizedConfig.name || provider.name || type;

  const health = new ProviderHealth(key, normalizedConfig);

  return { provider, health };
}


  static createAll(configs, opts = {}) {
    const { isDev = false } = opts;
    const providers = {};
    const healths = {};

    for (const [key, config] of providerConfigEntries(configs)) {
      if (!config.enabled) {
        console.log(
          `[ProviderFactory] ⏭️  ${key} (${config.type}) — disabled, atlandı`
        );
        continue;
      }

      if (isDev && config.type === 'braintree') {
        console.log(`[ProviderFactory][DEV] ⛔ Braintree atlandı: ${key}`);
        continue;
      }

      if (config.type === 'moneris' && !config.merchantId) {
        console.warn(
          `[ProviderFactory] ⚠️  ${key} — merchantId eksik; provider yüklendi ancak işlem çağrıları credential hatası verecek`
        );
      }

      try {
        const { provider, health } = this.create(key, config);
        providers[key] = provider;
        healths[key] = health;
        console.log(`[ProviderFactory] ✅ ${key} (${config.type}) oluşturuldu`);
      } catch (e) {
        console.error(
          `[ProviderFactory] ❌ ${key} oluşturulamadı:`,
          e.message
        );
      }
    }

    return { providers, healths };
  }
}

module.exports = ProviderFactory;
