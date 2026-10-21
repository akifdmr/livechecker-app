import StatBadge from './StatBadge';

export interface ProviderStats {
  name: string;
  enabled: boolean;
  available: boolean;
  weight: number;
  healthScore: number;
  successRate: number;
  avgDuration: number;
  totalRequests: number;
  approvedCount: number;
  declinedCount: number;
  errorCount: number;
  networkErrorCount: number;
  consecutiveErrors: number;
  disabledFor: string;
  lastError: string | null;
}

interface ProviderCardProps {
  providerKey: string;
  provider: ProviderStats;
  onToggle: () => void;
  loading: boolean;
}

export default function ProviderCard({
  providerKey,
  provider,
  onToggle,
  loading,
}: ProviderCardProps) {
  // Renk kodlaması
  const borderColor = provider.enabled
    ? provider.available
      ? 'border-accent'
      : 'border-warn'
    : 'border-border';

  const statusBadge = provider.enabled
    ? provider.available
      ? { text: '✅ AKTİF', cls: 'bg-accent text-white' }
      : { text: '⚠️ SORUNLU', cls: 'bg-warn text-black' }
    : { text: '⛔ PASİF', cls: 'bg-gray-600 text-white' };

  const srColor =
    provider.successRate >= 0.9
      ? 'text-accent'
      : provider.successRate >= 0.7
      ? 'text-warn'
      : 'text-dead';

  return (
    <div className={`bg-bg-input border-2 rounded-lg p-3 ${borderColor}`}>
      {/* ÜST SATIR: İsim + Badge + Buton */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-gray-200">
            {provider.name}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge.cls}`}
          >
            {statusBadge.text}
          </span>
          <span className="text-[10px] text-gray-500 font-mono">
            key: {providerKey}
          </span>
        </div>

        <button
          onClick={onToggle}
          disabled={loading}
          className={`px-3 py-1 rounded text-xs font-bold transition ${
            provider.enabled
              ? 'bg-dead hover:bg-red-700 text-white'
              : 'bg-accent hover:bg-green-600 text-white'
          } disabled:opacity-50`}
        >
          {provider.enabled ? '⛔ Disable' : '✅ Enable'}
        </button>
      </div>

      {/* ANA STATS */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px]">
        <StatBadge label="Weight" value={provider.weight.toFixed(1)} />
        <StatBadge label="Health" value={`${provider.healthScore}%`} />
     <StatBadge
  label="API Success"
  value={`${Math.round(provider.successRate * 100)}%`}
  valueClass={srColor}
/>
<StatBadge
  label="Approval"
  value={
    provider.totalRequests > 0
      ? `${Math.round((provider.approvedCount / provider.totalRequests) * 100)}%`
      : '—'
  }
  valueClass="text-accent"
/>
        <StatBadge label="Avg Speed" value={`${provider.avgDuration}ms`} />
        <StatBadge
          label="Approved"
          value={provider.approvedCount}
          valueClass="text-accent"
        />
        <StatBadge
          label="Declined"
          value={provider.declinedCount}
          valueClass="text-dead"
        />
      </div>

      {/* İKİNCİ SATIR: Hatalar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] mt-2">
        <StatBadge label="Toplam İstek" value={provider.totalRequests} />
        <StatBadge
          label="Hata"
          value={provider.errorCount}
          valueClass={provider.errorCount > 0 ? 'text-warn' : 'text-gray-400'}
        />
        <StatBadge
          label="Network Err"
          value={provider.networkErrorCount}
          valueClass={
            provider.networkErrorCount > 0 ? 'text-warn' : 'text-gray-400'
          }
        />
        <StatBadge
          label="Ardışık Hata"
          value={provider.consecutiveErrors}
          valueClass={
            provider.consecutiveErrors > 0 ? 'text-dead' : 'text-gray-400'
          }
        />
      </div>

      {/* Disabled timer */}
      {provider.disabledFor !== '0s' && (
        <div className="mt-2 text-[10px] text-warn">
          ⏸ Devre dışı: {provider.disabledFor}
        </div>
      )}

      {/* Son hata */}
      {provider.lastError && (
        <div className="mt-2 text-[10px] text-dead bg-black/30 p-2 rounded font-mono truncate">
          ❌ Son hata: {provider.lastError}
        </div>
      )}
    </div>
  );
}