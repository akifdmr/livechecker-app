function maskPan(pan) {
  return pan.slice(0, 6) + '****' + pan.slice(-4);
}

module.exports = { maskPan };