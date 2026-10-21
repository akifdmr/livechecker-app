function luhnCheck(pan) {
  let sum = 0, alt = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let n = parseInt(pan.charAt(i), 10);
    if (isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n = (n % 10) + 1;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

module.exports = { luhnCheck };