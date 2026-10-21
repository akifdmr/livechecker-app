// Stripe configuration smoke test. No card data is submitted.
require('dotenv').config();
const StripeProvider = require('./providers/StripeProvider');
const p = new StripeProvider('stripe', {
  type: 'stripe',
  name: 'Stripe',
  apiKey: process.env.STRIPE_SECRET_KEY || '',
});
console.log('Stripe configured:', Boolean(p.config.apiKey));
console.log('Capabilities:', p.capabilities());
