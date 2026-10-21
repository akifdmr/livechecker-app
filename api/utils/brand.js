function detectBrand(pan) {
  if (/^4/.test(pan)) return 'VISA';
  if (/^5[1-5]/.test(pan) || /^2[2-7]/.test(pan)) return 'MASTERCARD';
  if (/^3[47]/.test(pan)) return 'AMEX';
  if (/^6(?:011|5)/.test(pan)) return 'DISCOVER';
  if (/^35/.test(pan)) return 'JCB';
  if (/^3(?:0[0-5]|[68])/.test(pan)) return 'DINERS';
  return 'UNKNOWN';
}

module.exports = { detectBrand };