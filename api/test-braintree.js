// test-braintree.js
require('dotenv').config();
const BraintreeProvider = require('./providers/BraintreeProvider');

const config = {
  type: 'braintree',
  name: 'Braintree (Sandbox)',
  environment: 'sandbox',
  merchantId: 'jws5mjkz4qjpg3bx',
  publicKey: 'wf3pbxpw6qyfhw96',
  privateKey: 'GERCEK_PRIVATE_KEY_BURAYA',   // ← Braintree panelinden al
  avsRules: {
    accept: ['X', 'Y'],
    acceptPartial: ['P', 'Z', 'W', 'A'],
    reject: ['N', 'R', 'E'],
    unknown: ['U', 'S', 'G', 'B'],
  },
  cvvRules: { accept: ['M'], reject: ['N'], unknown: ['P', 'S', 'U'] },
};

const TEST_CARDS = {
  visa_success:        { pan: '4111111111111111', expMonth: '12', expYear: '2030', cvv: '123' },
  mastercard_success:  { pan: '5555555555554444', expMonth: '12', expYear: '2030', cvv: '123' },
  amex_success:        { pan: '378282246310005',  expMonth: '12', expYear: '2030', cvv: '1234' },
  cvv_fail:            { pan: '4000111111111115', expMonth: '12', expYear: '2030', cvv: '200' },
  expired:             { pan: '4111111111111111', expMonth: '01', expYear: '2020', cvv: '123' },
  invalid_number:      { pan: '1234567890123456', expMonth: '12', expYear: '2030', cvv: '123' },
};

async function runTest(name, card) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 TEST: ${name}`);
  console.log(`${'='.repeat(60)}`);

  const provider = new BraintreeProvider('test', config);

  try {
    const start = Date.now();
    const result = await provider.verify(card);
    const elapsed = Date.now() - start;

    console.log(`⏱️  Süre: ${elapsed}ms`);
    console.log(`📊 Sonuç:`, JSON.stringify(result, null, 2));

    return result;
  } catch (e) {
    console.error(`💥 HATA: ${e.message}`);
    console.error(e.stack);
    return null;
  }
}

(async () => {
  console.log('🚀 Braintree Sandbox Test Başlıyor...\n');

  await runTest('Visa Success', TEST_CARDS.visa_success);
  await runTest('Mastercard Success', TEST_CARDS.mastercard_success);
  await runTest('Amex Success', TEST_CARDS.amex_success);
  await runTest('CVV Fail', TEST_CARDS.cvv_fail);
  await runTest('Expired Card', TEST_CARDS.expired);
  await runTest('Invalid Number', TEST_CARDS.invalid_number);

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Test tamamlandı');
  console.log(`${'='.repeat(60)}`);
})();