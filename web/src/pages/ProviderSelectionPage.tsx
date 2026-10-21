import { useEffect, useState } from 'react';
import { posApi } from '../api/pos';
import { useAuthStore } from '../stores/authStore';
import { getPreferredPosProvider, setPreferredPosProvider } from '../utils/posProviderPreference';

type ProviderOption = {
  key: string;
  name: string;
  type?: string;
  capabilities?: {
    sale?: boolean;
    tokenizedPayment?: boolean;
    terminalPayment?: boolean;
  };
};

export default function ProviderSelectionPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await posApi.providers();
        const options = (result.providers || []).filter((provider: ProviderOption) =>
          provider.capabilities?.sale === true &&
          (provider.capabilities?.tokenizedPayment === true || provider.capabilities?.terminalPayment === true)
        );
        if (cancelled) return;
        setProviders(options);
        const saved = getPreferredPosProvider(userId);
        setSelected(options.some((provider) => provider.key === saved) ? saved : '');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Provider listesi alınamadı.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  function choose(providerKey: string) {
    setSelected(providerKey);
    setPreferredPosProvider(userId, providerKey);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-accent">POS Provider Seçimi</h1>
        <p className="mt-1 text-sm text-gray-400">
          POS işlemlerinde varsayılan kullanılacak etkin provider’ı seçin. Seçim hesabınıza ait tarayıcıda saklanır.
        </p>
      </header>

      {error && <div className="rounded-md border border-dead/40 bg-dead/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-border bg-bg-card">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Tür</th>
              <th className="px-4 py-3">POS yöntemi</th>
              <th className="px-4 py-3">Seçim</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {providers.map((provider) => {
              const active = selected === provider.key;
              const method = provider.capabilities?.tokenizedPayment ? 'Tokenlı ödeme' : 'Terminal';
              return (
                <tr key={provider.key} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold">{provider.name || provider.key}</td>
                  <td className="px-4 py-3 text-gray-400">{provider.type || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{method}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => choose(provider.key)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${active ? 'bg-accent text-white' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                      {active ? 'Varsayılan' : 'POS için seç'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && providers.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">Şu anda etkin POS provider yok. Sunucuda etkinleştirilmiş destekli provider’lar burada görünür.</td></tr>
            )}
            {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">Provider’lar yükleniyor…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
