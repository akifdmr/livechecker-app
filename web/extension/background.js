// ============================================================
// BACKGROUND SERVICE WORKER — Sağ tık menü + token yönetimi
// ============================================================

// Kurulumda sağ tık menüsü ekle
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'livecheck-selection',
    title: 'LiveCheck: "%s"',
    contexts: ['selection'],
  });
});

// Sağ tık tıklandığında
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'livecheck-selection' && info.selectionText) {
    const { token, backendUrl } = await chrome.storage.local.get([
      'token',
      'backendUrl',
    ]);

    const baseUrl = backendUrl || 'http://localhost:3000';

    if (!token) {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icon-128.png',
        title: 'LiveChecker',
        message: 'Giriş yapmalısın. Options sayfasını aç.',
      });
      return;
    }

    try {
      const res = await fetch(`${baseUrl}/balance-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          card: info.selectionText.trim(),
          amount: 0,
          operation: 'live_check',
          provider: 'clover3',
        }),
      });
      const data = await res.json();

      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icon-128.png',
        title: data.success ? '✅ LIVE' : '❌ DECLINED',
        message:
          (data.reasonShort || data.reason || 'Bilinmeyen') +
          (data.provider ? ` — via ${data.provider}` : ''),
      });
    } catch (e) {
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icon-128.png',
        title: 'LiveChecker Hatası',
        message: e.message,
      });
    }
  }
});