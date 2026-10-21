// ============================================================
// config.js — LiveChecker Backend Configuration
// ============================================================
const path = require('path');

// ============================================================
// ORTAM
// ============================================================
const APP_ENV = process.env.APP_ENV || process.env.NODE_ENV || 'development';
const IS_DEV = APP_ENV === 'development' || APP_ENV === 'dev';
const IS_PROD = !IS_DEV;

// ============================================================
// ENV HELPERS
// ============================================================
function envOr(name, fallback) {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();

  if (IS_PROD && fallback) {
    console.warn(
      `[CONFIG][SECURITY] ${name} env'de tanımlı değil; ` +
      `kaynak koddaki fallback kullanılıyor. Üretimde env'den gelmeli.`
    );
  }
  return fallback;
}

function envBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

console.log(`[CONFIG] Ortam: ${APP_ENV} | Dev modu: ${IS_DEV}`);

// ============================================================
// ORTAK AVS / CVV RULE SET'LERİ
// ============================================================
const DEFAULT_AVS_RULES = {
  accept: ['X', 'Y'],
  acceptPartial: ['P', 'Z', 'W', 'A'],
  reject: ['N', 'R', 'E'],
  unknown: ['U', 'S', 'G', 'B'],
};

const DEFAULT_CVV_RULES = {
  accept: ['M'],
  reject: ['N'],
  unknown: ['P', 'S', 'U'],
};

// ============================================================
// CONFIG
// ============================================================
module.exports = {
  // ----------------------------------------------------------
  // Ortam & Genel
  // ----------------------------------------------------------
  APP_ENV,
  IS_DEV,
  IS_PROD,
  SERVE_WEB: envBool('SERVE_WEB', false),
  PORT: Number(process.env.PORT || 3000),
  PROCESSOR_VAULT_KEY: process.env.PROCESSOR_VAULT_KEY || '',

  BIN_CSV_PATH: path.join(__dirname, '..', 'binlist.csv'),
  EXTERNAL_BIN_API: 'https://lookups.binspoints.com/api/v1/bin/{bin}',

  DELAY_BETWEEN_CARDS: 3000,
  WEIGHT_RECALC_INTERVAL: 20,
  HEALTH_WINDOW_SIZE: 100,
  MIN_WEIGHT: 0,
  MAX_WEIGHT: 5,
  ERROR_THRESHOLD: 0.5,
  CIRCUIT_BREAKER_THRESHOLD: 3,
  CIRCUIT_BREAKER_TIMEOUT: 600_000,

  // ----------------------------------------------------------
  // Provider Priority (dev + live-check)
  // ----------------------------------------------------------
  DEV_PROVIDER_PRIORITY: ['clover3', 'authorize-hamza'],

LIVE_CHECK: {
  provider: 'SNSAUTO',                             // ⭐ default
  providerPriority: ['SNSAUTO', 'authorize-hamza', 'clover3'],
  enableFailover: true,
  preferResinWhenNoCvv: true,
},

BALANCE_CHECK: {
  provider: 'clover3',
  providerPriority: ['clover3', 'SNSAUTO', 'authorize-hamza'],   // ⭐ SNSAUTO eklendi
  enableFailover: true,
  authAmount: 1.0,
  refundAmount: 0.3,
  currency: 'USD',
},

  MONERIS_ENABLED: envBool('MONERIS_ENABLED', false),

  // ============================================================
  // PROVIDERS
  // ============================================================
  PROVIDERS: {
    // --------------------------------------------------------
    // AUTHORIZE.NET
    // --------------------------------------------------------
    authorize: [
      // ⭐ Aktif: HamzaMedine
      {
        key: 'authorize-hamza',
        type: 'authorize',
        name: 'Authorize.net',
        endpoint: 'https://api.authorize.net/xml/v1/request.api',

        // Credentials
        username: envOr('AUTHORIZE_HAMZA_USERNAME', 'Genco.'),
        password: envOr('AUTHORIZE_HAMZA_PASSWORD', 'Tasar/7221//'),
        apiLoginId: envOr('AUTHORIZE_HAMZA_LOGIN_ID', '3zy8yS9N7'),
        transactionKey: envOr('AUTHORIZE_HAMZA_TXN_KEY', '9C4sSpMPf4T89243'),
        clientKey: envOr(
          'AUTHORIZE_HAMZA_CLIENT_KEY',
          '6ej5Ww2pEY6CJ7H2J6RU649J49UzPFukeLzTb5tkqfZkck4tRLbudE5Hm79LqrCN'
        ),
        signatureKey: envOr(
          'AUTHORIZE_HAMZA_SIG_KEY',
          '17E82E7FCECE6BA2E277D48023CE6CBA33A48B0C7A654FB868BA61741E070B20CB2D26A6259CDB41B093B879F7F38F4DB1F94C5B26C0B2DCE1F7653E5CCA8A7A'
        ),

        enabled: true,
        basePriority: 10,
        avsRules: DEFAULT_AVS_RULES,
        cvvRules: DEFAULT_CVV_RULES,
      },

      // ⏸ Hintli (env ile aktifleştirilebilir)
      {
        key: 'hintli',
        type: 'authorize',
        name: 'Authorize.net (Hintli)',
        endpoint: 'https://api.authorize.net/xml/v1/request.api',

        username: envOr('AUTHORIZE_USERNAME', ''),
        password: envOr('AUTHORIZE_PASSWORD', ''),
        apiLoginId: envOr('AUTHORIZE_API_LOGIN_ID', ''),
        transactionKey: envOr('AUTHORIZE_TRANSACTION_KEY', ''),
        clientKey: envOr('AUTHORIZE_CLIENT_KEY', ''),
        signatureKey: envOr('AUTHORIZE_SIGNATURE_KEY', ''),

        enabled: !!envOr('AUTHORIZE_API_LOGIN_ID', '') && !!envOr('AUTHORIZE_TRANSACTION_KEY', ''),
        basePriority: 10,
        avsRules: DEFAULT_AVS_RULES,
        cvvRules: DEFAULT_CVV_RULES,
      },

      // ⏸ Diamondscafford (env ile aktifleştirilebilir)
      {
        key: 'diamondscafford',
        type: 'authorize',
        name: 'Authorize.net (Diamondscafford)',
        endpoint: 'https://api.authorize.net/xml/v1/request.api',

        username: envOr('AUTHORIZE_USERNAME', ''),
        password: envOr('AUTHORIZE_PASSWORD', ''),
        apiLoginId: envOr('AUTHORIZE_DIAMOND_LOGIN_ID', '6KTes82Hg'),
        transactionKey: envOr('AUTHORIZE_DIAMOND_TXN_KEY', ''),
        clientKey: envOr('AUTHORIZE_CLIENT_KEY', ''),
        signatureKey: envOr('AUTHORIZE_SIGNATURE_KEY', ''),

        enabled: !!envOr('AUTHORIZE_DIAMOND_TXN_KEY', ''),
        basePriority: 10,
        avsRules: DEFAULT_AVS_RULES,
        cvvRules: DEFAULT_CVV_RULES,
      },

      // ⏸ SammyLogi
      {
        key: 'SammyLogi',
        type: 'authorize',
        name: 'Authorize.net (SammyLogi)',
        endpoint: 'https://api.authorize.net/xml/v1/request.api',

        username: envOr('AUTHORIZE_USERNAME', ''),
        password: envOr('AUTHORIZE_PASSWORD', ''),
        apiLoginId: envOr('AUTHORIZE_SAMMY_LOGIN_ID', '6KTes82Hg'),
        transactionKey: envOr('AUTHORIZE_SAMMY_TXN_KEY', ''),
        clientKey: envOr('AUTHORIZE_CLIENT_KEY', ''),
        signatureKey: envOr('AUTHORIZE_SIGNATURE_KEY', ''),

        enabled: !!envOr('AUTHORIZE_SAMMY_TXN_KEY', ''),
        basePriority: 10,
        avsRules: DEFAULT_AVS_RULES,
        cvvRules: DEFAULT_CVV_RULES,
      },

      // ⏸ Acaysoftware
      {
        key: 'acaysoftware',
        type: 'authorize',
        name: 'Authorize.net (Acaysoftware)',
        endpoint: 'https://api.authorize.net/xml/v1/request.api',

        username: envOr('AUTHORIZE_USERNAME', ''),
        password: envOr('AUTHORIZE_PASSWORD', ''),
        apiLoginId: envOr('AUTHORIZE_ACAY_LOGIN_ID', '6KTes82Hg'),
        transactionKey: envOr('AUTHORIZE_ACAY_TXN_KEY', ''),
        clientKey: envOr('AUTHORIZE_CLIENT_KEY', ''),
        signatureKey: envOr('AUTHORIZE_SIGNATURE_KEY', ''),

        enabled: !!envOr('AUTHORIZE_ACAY_TXN_KEY', ''),
        basePriority: 10,
        avsRules: DEFAULT_AVS_RULES,
        cvvRules: DEFAULT_CVV_RULES,
      },
    ],

    // --------------------------------------------------------
    // CLOVER
    // ⚠️ Public Key token endpoint, Private Key charge/capture/refund
    // --------------------------------------------------------
    clover: [
      // ⭐ HamzaMedine — HAMZA AND MADINA HALAL
      // ⚠️ Mevcut public key (fac77958-...) REVOKE edilmiş →
      //    `.env`'e CLOVER_HAMZA_PUBLIC_KEY olarak yeni UUID gir.
{
  key: 'clover3',
  type: 'clover',
  name: 'HamzaMedine',
  currency: 'USD',  // TODO: Charge 400 derse CAD dene

  tokenUrl: 'https://token.clover.com/v1/tokens',
  chargeUrl: 'https://scl.clover.com/v1/charges',

  merchantId: envOr('CLOVER_HAMZA_MERCHANT_ID', 'SPT0MNAVW6JJ1'),
  // ⭐ v11: Yeni pair — curl ile doğrulandı (200 OK)
  publicKey: envOr('CLOVER_HAMZA_PUBLIC_KEY', 'ccf5f644caa51163135d7d68f5d4e539'),
  privateKey: envOr('CLOVER_HAMZA_PRIVATE_KEY', 'f76a94d0-6e41-c174-2141-beb5049cdb6f'),
  ecommercePrivateKey: envOr('CLOVER_HAMZA_ECOMMERCE_PRIVATE_KEY', 'f76a94d0-6e41-c174-2141-beb5049cdb6f'),
  apiToken: envOr('CLOVER_HAMZA_API_TOKEN', 'ccf5f644caa51163135d7d68f5d4e539'),

  enabled: true,
  basePriority: 5,
},

      // ⏸ BOOSTEDEURO
      {
        key: 'BOOSTEDEURO',
        type: 'clover',
        name: 'BOOSTEDEURO',
        currency: envOr('CLOVER_BOOSTEDEURO_CURRENCY', 'EUR'),

        tokenUrl: 'https://token.clover.com/v1/tokens',
        chargeUrl: 'https://scl.clover.com/v1/charges',

        merchantId: envOr('CLOVER_BOOSTEDEURO_MERCHANT_ID', ''),
        publicKey: envOr('CLOVER_BOOSTEDEURO_PUBLIC_KEY', ''),
        privateKey: envOr('CLOVER_BOOSTEDEURO_PRIVATE_KEY', ''),
        ecommercePrivateKey: envOr('CLOVER_BOOSTEDEURO_ECOMMERCE_PRIVATE_KEY', ''),
        apiToken: envOr('CLOVER_BOOSTEDEURO_API_TOKEN', ''),

        enabled:
          !!envOr('CLOVER_BOOSTEDEURO_API_TOKEN', '') &&
          !!envOr('CLOVER_BOOSTEDEURO_MERCHANT_ID', ''),
        basePriority: 5,
      },

      // ⏸ Acaysoftware
      {
        key: 'acaysoftware-clover',
        type: 'clover',
        name: 'acaysoftware (Clover)',
        currency: envOr('CLOVER_ACAYSOFTWARE_CURRENCY', 'USD'),

        tokenUrl: 'https://token.clover.com/v1/tokens',
        chargeUrl: 'https://scl.clover.com/v1/charges',

        merchantId: envOr('CLOVER_ACAYSOFTWARE_MERCHANT_ID', ''),
        publicKey: envOr('CLOVER_ACAYSOFTWARE_PUBLIC_KEY', ''),
        privateKey: envOr('CLOVER_ACAYSOFTWARE_PRIVATE_KEY', ''),
        ecommercePrivateKey: envOr('CLOVER_ACAYSOFTWARE_ECOMMERCE_PRIVATE_KEY', ''),
        apiToken: envOr('CLOVER_ACAYSOFTWARE_API_TOKEN', ''),

        enabled:
          !!envOr('CLOVER_ACAYSOFTWARE_API_TOKEN', '') &&
          !!envOr('CLOVER_ACAYSOFTWARE_MERCHANT_ID', ''),
        basePriority: 5,
      },

      // ⭐ S&S Auto express — Kanada
      {
        key: 'SNSAUTO',
        type: 'clover',
        name: 'SNSAUTO (S&S Auto express)',
        currency: envOr('CLOVER_SNS_CURRENCY', 'CAD'),  // ⭐ Curl ile doğrulandı

        tokenUrl: 'https://token.clover.com/v1/tokens',
        chargeUrl: 'https://scl.clover.com/v1/charges',

        merchantId: envOr('CLOVER_SNS_MERCHANT_ID', '00QZ399B5VBV1'),
        publicKey: envOr('CLOVER_SNS_PUBLIC_KEY', '1d3415abb26f901c9ff22135792a8b6e'),
        privateKey: envOr('CLOVER_SNS_PRIVATE_KEY', '0d4ea7f7-3c51-9290-42d1-f51f00e933b3'),
        ecommercePrivateKey: envOr('CLOVER_SNS_ECOMMERCE_PRIVATE_KEY', '0d4ea7f7-3c51-9290-42d1-f51f00e933b3'),
        apiToken: envOr('CLOVER_SNS_API_TOKEN', '7919eb44-a507-8d77-78fd-4d902d89a64a'),

        enabled: true,
        basePriority: 5,
      },
    ],

    // --------------------------------------------------------
    // STRIPE
    // --------------------------------------------------------
    stripe: {
      type: 'stripe',
      name: 'Stripe',
      apiKey: envOr('STRIPE_SECRET_KEY', ''),
      publishedKey: envOr('STRIPE_PUBLISHABLE_KEY', ''),
      enabled: envBool('STRIPE_ENABLED', !!process.env.STRIPE_SECRET_KEY),
      basePriority: 8,
    },

    // --------------------------------------------------------
    // MONERIS
    // --------------------------------------------------------
    moneris: {
      type: 'moneris',
      name: 'Moneris',
      enabled: envBool('MONERIS_ENABLED', false),
      basePriority: 6,
      environment: envOr('MONERIS_ENVIRONMENT', 'production'),
      baseUrl: envOr('MONERIS_BASE_URL', 'https://api.moneris.io'),
      sandboxBaseUrl: envOr('MONERIS_SANDBOX_BASE_URL', 'https://api.sb.moneris.io'),

      clientId: envOr('MONERIS_CLIENT_ID', ''),
      clientSecret: envOr('MONERIS_CLIENT_SECRET', ''),
      apiKey: envOr('MONERIS_API_KEY', ''),
      merchantId: envOr('MONERIS_MERCHANT_ID', ''),

      apiVersion: envOr('MONERIS_API_VERSION', '2024-09-17'),
      scope: envOr('MONERIS_SCOPE', 'payment.write'),
      currency: envOr('MONERIS_CURRENCY', 'CAD'),
      timeout: Number(envOr('MONERIS_TIMEOUT', '30000')),
    },

    // --------------------------------------------------------
    // myPOS ePOS
    // --------------------------------------------------------
    mypos: {
      type: 'mypos',
      name: 'myPOS ePOS',
      environment: envOr('MYPOS_ENVIRONMENT', 'demo'),

      integrationClientId: envOr('MYPOS_INTEGRATION_CLIENT_ID', ''),
      integrationClientSecret: envOr('MYPOS_INTEGRATION_CLIENT_SECRET', ''),
      partnerId: envOr('MYPOS_PARTNER_ID', ''),
      applicationId: envOr('MYPOS_APPLICATION_ID', ''),
      merchantClientId: envOr('MYPOS_MERCHANT_CLIENT_ID', ''),
      merchantClientSecret: envOr('MYPOS_MERCHANT_CLIENT_SECRET', ''),
      terminalId: envOr('MYPOS_TERMINAL_ID', ''),

      currency: envOr('MYPOS_CURRENCY', 'EUR'),
      appName: envOr('MYPOS_APP_NAME', 'Manager POS'),
      appVersion: envOr('MYPOS_APP_VERSION', '1.0.0'),
      timeout: Number(envOr('MYPOS_TIMEOUT', '30000')),

      enabled: envBool(
        'MYPOS_ENABLED',
        !!(
          process.env.MYPOS_INTEGRATION_CLIENT_ID &&
          process.env.MYPOS_INTEGRATION_CLIENT_SECRET &&
          process.env.MYPOS_PARTNER_ID &&
          process.env.MYPOS_APPLICATION_ID &&
          process.env.MYPOS_MERCHANT_CLIENT_ID &&
          process.env.MYPOS_MERCHANT_CLIENT_SECRET &&
          process.env.MYPOS_TERMINAL_ID
        )
      ),
      basePriority: 1,
    },
  },
};