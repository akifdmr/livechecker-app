// ============================================================
// utils/effectiveUserId.js
// Admin için: null (= tüm kullanıcılar) veya ?userId=X
// Normal user için: kendi id'si (zorla)
//
// Kullanım:
//   const uid = await effectiveUserId(req, req.query.userId);
//   if (uid === null) → admin, tüm veriyi döndür
//   else → uid'ye filtrele
// ============================================================
const dbService = require('../services/DbService');

async function effectiveUserId(req, requestedUserId = null) {
  if (!req.user?.id) return null;

  // 1) Fast path — auth middleware role koyduysa
  let isAdmin = req.user.role === 'admin';

  // 2) Fallback — DB'den teyit (defense-in-depth)
  if (!isAdmin) {
    isAdmin = await dbService.isUserAdmin(req.user.id);
    if (isAdmin) req.user.role = 'admin'; // cache
  }

  // 3) Normal user — her zaman kendi id'si
  if (!isAdmin) return req.user.id;

  // 4) Admin — ?userId=X verilmişse o, verilmemişse null (= all)
  if (requestedUserId === undefined || requestedUserId === null || requestedUserId === '') {
    return null; // tüm kullanıcılar
  }
  const n = parseInt(requestedUserId, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = effectiveUserId;