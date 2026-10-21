function isExpired(expMonth, expYear) {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  return (
    parseInt(expYear, 10) < cy ||
    (parseInt(expYear, 10) === cy && parseInt(expMonth, 10) < cm)
  );
}

module.exports = { isExpired };