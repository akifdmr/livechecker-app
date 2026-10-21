// ============================================================
// INTEL PAGE — Multi-Service Sorgulama
// ============================================================
import { useState } from 'react';
import { intelApi } from '../api';

type QueryType = 'ip' | 'domain' | 'email' | 'phone';

export default function IntelPage() {
  const [queryType, setQueryType] = useState<QueryType>('ip');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function handleQuery() {
    if (!input.trim()) {
      setError('Değer gerekli');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      let data;
      if (queryType === 'ip') data = await intelApi.lookupIP(input.trim());
      else if (queryType === 'domain') data = await intelApi.lookupDomain(input.trim());
      else if (queryType === 'email') data = await intelApi.lookupEmail(input.trim());
      else if (queryType === 'phone') data = await intelApi.lookupPhone(input.trim());

      setResult(data);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="p-5 border rounded-lg bg-bg-card border-border">
        <h1 className="mb-2 text-xl font-bold text-accent">🛡️ OSINT Intel</h1>
        <p className="mb-4 text-xs text-gray-500">
          IP, Domain, Email, Phone için çoklu servis sorgulaması
        </p>

        {/* TYPE SELECTOR */}
        <div className="flex gap-2 mb-3">
          {[
            { v: 'ip', label: '🌐 IP', ph: '8.8.8.8' },
            { v: 'domain', label: '🔗 Domain', ph: 'example.com' },
            { v: 'email', label: '📧 Email', ph: 'user@example.com' },
            { v: 'phone', label: '📞 Telefon', ph: '+905551234567' },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => {
                setQueryType(t.v as QueryType);
                setInput('');
                setResult(null);
                setError('');
              }}
              className={`px-3 py-2 rounded-md text-xs font-bold transition ${
                queryType === t.v
                  ? 'bg-accent text-white'
                  : 'bg-[#222] text-gray-400 hover:bg-[#333]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* INPUT */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
            placeholder={
              queryType === 'ip'
                ? '8.8.8.8'
                : queryType === 'domain'
                ? 'example.com'
                : queryType === 'email'
                ? 'user@example.com'
                : '+905551234567'
            }
            className="flex-1 px-3 py-2 font-mono text-sm border rounded-md outline-none bg-bg-input border-border focus:border-accent"
          />
          <button
            onClick={handleQuery}
            disabled={loading}
            className="px-6 py-2 text-sm font-bold text-white rounded-md bg-accent hover:bg-green-600 disabled:bg-gray-600"
          >
            {loading ? '⏳' : '🔍 Sorgula'}
          </button>
        </div>

        {error && (
          <div className="p-2 mt-3 text-xs border rounded-md text-dead bg-dead/10 border-dead">
            ❌ {error}
          </div>
        )}
      </div>

      {/* RESULT */}
      {result && (
        <div className="space-y-3">
          {/* RISK SCORE */}
          {result.risk && (
            <div
              className={`bg-bg-card border-2 rounded-lg p-4 ${
                result.risk.level === 'critical'
                  ? 'border-dead'
                  : result.risk.level === 'high'
                  ? 'border-warn'
                  : result.risk.level === 'medium'
                  ? 'border-warn/50'
                  : 'border-accent'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 uppercase">Risk Skoru</div>
                  <div className="text-3xl font-bold">
                    {result.risk.score}
                    <span className="text-sm text-gray-500">/100</span>
                  </div>
                </div>
                <div
                  className={`px-4 py-2 rounded-md text-sm font-bold uppercase ${
                    result.risk.level === 'critical'
                      ? 'bg-dead text-white'
                      : result.risk.level === 'high'
                      ? 'bg-warn text-black'
                      : result.risk.level === 'medium'
                      ? 'bg-warn/30 text-warn'
                      : 'bg-accent/20 text-accent'
                  }`}
                >
                  {result.risk.level}
                </div>
              </div>

              {result.risk.reasons?.length > 0 && (
                <div className="pt-3 mt-3 border-t border-border">
                  {result.risk.reasons.map((r: string, i: number) => (
                    <div key={i} className="text-xs text-gray-400">
                      • {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SERVICES */}
          <div className="overflow-hidden border rounded-lg bg-bg-card border-border">
            <div className="px-4 py-3 bg-[#1f1f1f] border-b border-border">
              <div className="text-sm font-bold text-info">
                📊 Servis Sonuçları ({Object.keys(result.services || {}).length})
              </div>
            </div>

            <div className="divide-y divide-border">
              {Object.entries(result.services || {}).map(([key, svc]: [string, any]) => (
                <div key={key} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold uppercase text-accent">
                      {key}
                    </div>
                    <div
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        svc?.ok === false
                          ? 'bg-dead/20 text-dead'
                          : svc?.ok === true
                          ? 'bg-accent/20 text-accent'
                          : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {svc?.ok === false ? '❌ HATA' : svc?.ok === true ? '✅ OK' : '⚠️ BİLİNMEZ'}
                    </div>
                  </div>

                  {svc?.error ? (
                    <div className="text-xs text-dead">{svc.error}</div>
                  ) : (
                    <pre className="overflow-x-auto text-[11px] text-gray-400 bg-[#0d0d0d] p-2 rounded">
                      {JSON.stringify(svc, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* RAW JSON */}
          <details className="overflow-hidden border rounded-lg bg-bg-card border-border">
            <summary className="px-4 py-3 text-xs font-bold cursor-pointer bg-[#1f1f1f] text-gray-400 hover:text-accent">
              🔍 Ham JSON
            </summary>
            <pre className="p-4 overflow-x-auto text-[11px] text-gray-400">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}