// ============================================================
// POPUP — Hızlı Live Check
// ============================================================
import { useState } from 'react';
import { getApiBaseUrl, useAuthStore } from '../stores/authStore';

interface ResultData {
  success: boolean;
  status: string;
  reason: string;
  reasonShort?: string;
  reasonLong?: string;
  provider?: string;
  authCode?: string;
  duration?: number;
  error?: { message?: string } | null;
}

const PROVIDERS = [
  { key: 'clover3', label: 'Clover' },
  { key: 'authorize3', label: 'Authorize.net' },
];

export default function Popup() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const backendUrl = useAuthStore((s) => s.backendUrl);
  const logout = useAuthStore((s) => s.logout);

  const [card, setCard] = useState('');
  const [amount, setAmount] = useState('1');
  const [provider, setProvider] = useState('clover3');
  const [operation, setOperation] = useState<'live_check' | 'preauth'>('live_check');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);

  async function submit() {
    if (!token) {
      alert('Önce giriş yapmalısın.');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${getApiBaseUrl(backendUrl)}/balance-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          card,
          amount: operation === 'live_check' ? 0 : parseFloat(amount),
          provider,
          operation,
        }),
      });

      if (res.status === 401) {
        logout();
        setResult({
          success: false,
          status: 'UNAUTHORIZED',
          reason: 'token_expired',
          reasonShort: 'Oturum süresi doldu',
        });
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({
        success: false,
        status: 'ERROR',
        reason: 'network_error',
        error: { message: e.message },
      });
    } finally {
      setLoading(false);
    }
  }

  function openOptions() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.openOptionsPage();
    }
  }

  return (
    <div className="p-4 bg-[#090b10] text-white min-h-[500px]">
      <div className="flex items-center justify-between mb-4">
        <span className="font-bold text-accent">LiveChecker</span>
        <button onClick={openOptions} className="text-xs text-gray-400">
          ⚙️
        </button>
      </div>

      {user && (
        <div className="mb-3 px-2 py-1.5 rounded bg-[#111] text-[10px] text-gray-400">
          👤 {user.email}
        </div>
      )}

      {!token && (
        <div className="p-3 mb-4 text-xs border rounded bg-yellow-900/20 border-yellow-600 text-yellow-400">
          ⚠️ Giriş yapılmamış —{' '}
          <button onClick={openOptions} className="underline">
            Login ol
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setOperation('live_check')}
          className={`flex-1 py-2 text-xs font-bold rounded ${
            operation === 'live_check'
              ? 'bg-green-600 text-white'
              : 'bg-[#222] text-gray-400'
          }`}
        >
          🔍 Live Check ($0)
        </button>
        <button
          onClick={() => setOperation('preauth')}
          className={`flex-1 py-2 text-xs font-bold rounded ${
            operation === 'preauth'
              ? 'bg-yellow-500 text-black'
              : 'bg-[#222] text-gray-400'
          }`}
        >
          🔒 Preauth
        </button>
      </div>

      <label className="block mb-3">
        <span className="block mb-1 text-xs text-gray-500">Kart</span>
        <input
          type="text"
          value={card}
          onChange={(e) => setCard(e.target.value)}
          placeholder="4111111111111111|12|2027|123"
          className="w-full px-3 py-2 font-mono text-xs border rounded bg-[#111] border-[#333] focus:border-green-500 outline-none"
        />
      </label>

      {operation === 'preauth' && (
        <label className="block mb-3">
          <span className="block mb-1 text-xs text-gray-500">Tutar ($)</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 font-mono text-xs border rounded bg-[#111] border-[#333]"
          />
        </label>
      )}

      <label className="block mb-3">
        <span className="block mb-1 text-xs text-gray-500">Provider</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full px-3 py-2 text-xs border rounded bg-[#111] border-[#333]"
        >
          {PROVIDERS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={submit}
        disabled={loading || !card || !token}
        className="w-full py-3 text-sm font-bold text-white rounded bg-green-600 hover:bg-green-500 disabled:bg-gray-600"
      >
        {loading ? '⏳ İşleniyor...' : '▶ Çalıştır'}
      </button>

      {result && (
        <div
          className={`mt-4 p-3 rounded border text-xs ${
            result.success
              ? 'bg-green-900/20 border-green-600 text-green-400'
              : 'bg-red-900/20 border-red-600 text-red-400'
          }`}
        >
          <div className="font-bold mb-1">
            {result.success ? '✅ LIVE' : `❌ ${result.status}`}
            {result.provider && (
              <span className="ml-2 text-[10px] text-gray-500">
                via {result.provider}
              </span>
            )}
          </div>
          {result.reasonShort && <div>Sebep: {result.reasonShort}</div>}
          {result.reasonLong && (
            <div className="mt-1 italic">{result.reasonLong}</div>
          )}
          {result.authCode && (
            <div>
              Auth: <code>{result.authCode}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
