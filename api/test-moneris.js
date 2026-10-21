// Moneris configuration smoke test.
// This script never submits a card transaction.
const config = require('./config');
const ProviderFactory = require('./core/ProviderFactory');

const { providers } = ProviderFactory.createAll(config.PROVIDERS, { isDev: config.IS_DEV });
const moneris = providers.moneris;

if (!moneris) {
  console.error('Moneris provider is disabled or credentials are not configured.');
  process.exitCode = 1;
} else {
  console.log('Moneris provider loaded:', moneris.name);
  console.log('Environment:', moneris.config.environment);
  console.log('Capabilities:', moneris.capabilities());
  console.log('No payment request was sent.');
}
