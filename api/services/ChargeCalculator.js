function positiveAmount(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error(`${label} pozitif bir tutar olmalı`), { statusCode: 400 });
  }
  return Math.round(amount * 100) / 100;
}

function calculateCaptureAmount(authAmount, mode = 'FULL_AUTH', requestedAmount) {
  const authorized = positiveAmount(authAmount, 'Provizyon');
  const normalizedMode = String(mode || 'FULL_AUTH').toUpperCase();
  let amount;

  if (normalizedMode === 'FULL_AUTH') amount = authorized;
  else if (normalizedMode === 'PCT_120') amount = Math.round(authorized * 120) / 100;
  else if (normalizedMode === 'BELOW_AUTH' || normalizedMode === 'CUSTOM') {
    amount = positiveAmount(requestedAmount, 'Capture');
    if (normalizedMode === 'BELOW_AUTH' && amount >= authorized) {
      throw Object.assign(new Error('BELOW_AUTH tutarı provizyondan düşük olmalı'), { statusCode: 400 });
    }
  } else {
    throw Object.assign(new Error('mode PCT_120, FULL_AUTH, BELOW_AUTH veya CUSTOM olmalı'), { statusCode: 400 });
  }

  if (amount > authorized) {
    throw Object.assign(
      new Error('Capture tutarı provizyonu aşamaz; fazla tutar için ayrı, açıkça onaylanan satış gerekir.'),
      { statusCode: 409, code: 'OVER_AUTH_REQUIRES_EXPLICIT_SALE', amount, authorized }
    );
  }
  return { amount, authorized, mode: normalizedMode };
}

module.exports = { calculateCaptureAmount };
