import { useEffect, useState } from 'react';
import ProviderCard, { type ProviderStats } from './ProviderCard';
import { getApiBaseUrl, useAuthStore } from '../../stores/authStore';

export default function ProviderList() {
  const [providers, setProviders] = useState<Record<string, ProviderStats>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProviders();
    // Her 10 saniyede bir yenile
    const interval = setInterval(loadProviders, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadProviders() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl(useAuthStore.getState().backendUrl)}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProviders(data);
    } catch (e) {
      console.error('[PROVIDERS]', e);
    }
  }

  async function toggleProvider(key: string, currentlyEnabled: boolean) {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const action = currentlyEnabled ? 'disable' : 'enable';
      const res = await fetch(
        `${getApiBaseUrl(useAuthStore.getState().backendUrl)}/provider/${key}/${action}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadProviders();
    } catch (e: any) {
      alert('Hata: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-accent font-bold text-lg">
            ⚙️ Processor Yönetimi
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Provider'ları enable/disable edebilir, canlı durumlarını
            izleyebilirsin. Her 10 saniyede otomatik yenilenir.
          </p>
        </div>
        <button
          onClick={loadProviders}
          disabled={loading}
          className="bg-[#555] hover:bg-[#666] disabled:bg-gray-700 text-white px-3 py-2 rounded-md text-xs font-bold"
        >
          {loading ? '...' : '🔄 Yenile'}
        </button>
      </div>

      {Object.keys(providers).length === 0 ? (
        <div className="text-center text-gray-500 py-4 text-xs">
          Provider bilgisi yükleniyor...
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(providers).map(([key, p]) => (
            <ProviderCard
              key={key}
              providerKey={key}
              provider={p}
              onToggle={() => toggleProvider(key, p.enabled)}
              loading={loading}
            />
          ))}
        </div>
      )}
    </div>
  );
}