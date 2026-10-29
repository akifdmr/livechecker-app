const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCaptureAmount } = require('../services/ChargeCalculator');
const { CreditsSettingsService, validSettingKey } = require('../services/CreditsSettingsService');
const { requireAdmin, scopeByOwner, assertCanView } = require('../auth');
const { safeRedirectUrl, publicProviderResult, safeIdentifier } = require('../services/PaymentService');

test('capture modes stay within the provider authorization', () => {
  assert.deepEqual(calculateCaptureAmount(100, 'FULL_AUTH'), {
    amount: 100, authorized: 100, mode: 'FULL_AUTH',
  });
  assert.equal(calculateCaptureAmount(100, 'BELOW_AUTH', 78.45).amount, 78.45);
  assert.equal(calculateCaptureAmount(100, 'CUSTOM', 15).amount, 15);
  assert.throws(
    () => calculateCaptureAmount(100, 'PCT_120'),
    (error) => error.code === 'OVER_AUTH_REQUIRES_EXPLICIT_SALE' && error.amount === 120
  );
  assert.throws(() => calculateCaptureAmount(100, 'BELOW_AUTH', 100), /düşük olmalı/);
});

test('credit spend is atomic, idempotent, and rejects overspend', async () => {
  const state = { balance: 10, ledger: [], audit: [] };
  const client = {
    async query(sql, values = []) {
      const query = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (query === 'begin' || query === 'commit' || query === 'rollback') return { rowCount: 0, rows: [] };
      if (query.startsWith('select credits from users')) return { rowCount: 1, rows: [{ credits: state.balance }] };
      if (query.startsWith('select amount, balance_after from credit_ledger')) {
        const row = state.ledger.find((entry) => entry.key === values[1]);
        return { rowCount: row ? 1 : 0, rows: row ? [{ amount: row.amount, balance_after: row.balance }] : [] };
      }
      if (query.startsWith('update users set credits')) { state.balance = values[0]; return { rowCount: 1, rows: [] }; }
      if (query.startsWith('insert into credit_ledger')) {
        state.ledger.push({ amount: values[1], balance: values[2], key: values[6] });
        return { rowCount: 1, rows: [] };
      }
      if (query.startsWith('insert into audit_events')) { state.audit.push(values); return { rowCount: 1, rows: [] }; }
      throw new Error(`Unexpected SQL in fixture: ${query}`);
    },
    release() {},
  };
  const pool = { connect: async () => client };
  const service = new CreditsSettingsService(pool);

  assert.deepEqual(await service.spend({ userId: 7, amount: 7, entryType: 'bin_check', idempotencyKey: 'request-1' }), { balance: 3, duplicate: false });
  assert.deepEqual(await service.spend({ userId: 7, amount: 7, entryType: 'bin_check', idempotencyKey: 'request-1' }), { balance: 3, duplicate: true });
  await assert.rejects(
    service.spend({ userId: 7, amount: 4, entryType: 'bin_check', idempotencyKey: 'request-2' }),
    (error) => error.code === 'INSUFFICIENT_CREDITS'
  );
  assert.equal(state.balance, 3);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.audit.length, 1);
});

test('settings keys allow only non-secret application settings', () => {
  assert.equal(validSettingKey('fees'), true);
  assert.equal(validSettingKey('default_provider'), true);
  assert.equal(validSettingKey('stripe_secret_key'), false);
  assert.equal(validSettingKey('otp'), false);
});

test('owner scope is fixed for users and explicit for admins', () => {
  assert.equal(scopeByOwner({ user: { id: 7, role: 'operator' } }, 9), 7);
  assert.equal(scopeByOwner({ user: { id: 1, role: 'admin' } }, '9'), 9);
  assert.equal(assertCanView({ user: { id: 7, role: 'operator' } }, 7), true);
  assert.equal(assertCanView({ user: { id: 7, role: 'operator' } }, 9), false);
  assert.equal(assertCanView({ user: { id: 1, role: 'admin' } }, 9), true);
});

test('admin middleware rejects non-admin users', () => {
  let status;
  let body;
  let continued = false;
  const response = {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
  };
  requireAdmin({ user: { id: 7, role: 'operator' } }, response, () => { continued = true; });
  assert.equal(status, 403);
  assert.equal(body.error, 'Admin gerekli');
  assert.equal(continued, false);
});

test('provider redirect is limited to HTTPS URLs and is never stored with provider result data', () => {
  assert.equal(safeRedirectUrl('https://issuer.example/challenge?id=example'), 'https://issuer.example/challenge?id=example');
  assert.equal(safeRedirectUrl('http://issuer.example/challenge'), null);
  assert.equal(safeRedirectUrl('javascript:alert(1)'), null);
  const publicResult = publicProviderResult({
    success: false,
    status: 'requires_action',
    clientSecret: 'pi_secret_value',
    raw: { card: 'sensitive' },
    redirectUrl: 'https://issuer.example/challenge',
  });
  assert.equal(publicResult.actionRequired, true);
  assert.equal(publicResult.redirectUrl, 'https://issuer.example/challenge');
  assert.equal('clientSecret' in publicResult, false);
  assert.equal('raw' in publicResult, false);
  assert.throws(() => safeIdentifier('4111111111111111', 'idempotencyKey'), /geçersiz/);
});
