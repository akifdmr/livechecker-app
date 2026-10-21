import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { processorRoutingApi, type ProcessorRule } from '../api';

const PROVIDERS = ['clover3', 'authorize3'];

const emptyForm = {
  name: '',
  bin_prefix: '',
  provider: 'clover3',
  priority: 10,
  notes: '',
};

export default function ProcessorRoutingPage() {
  const navigate = useNavigate();
  const [rules, setRules] = useState<ProcessorRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      setRules(await processorRoutingApi.list());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function save() {
    setError(null);
    try {
      if (editId) await processorRoutingApi.update(editId, form);
      else await processorRoutingApi.create(form);
      setForm(emptyForm);
      setEditId(null);
      await reload();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  }

  async function del(id: number) {
    if (!confirm('Silinsin mi?')) return;
    await processorRoutingApi.delete(id);
    await reload();
  }

  function edit(r: ProcessorRule) {
    setEditId(r.id);
    setForm({
      name: r.name, bin_prefix: r.bin_prefix,
      provider: r.provider, priority: r.priority, notes: r.notes || '',
    });
  }

  return (
    <div className="max-w-5xl p-6">
      <h1 className="mb-2 text-xl font-bold text-accent">⚙️ Processor Routing</h1>
      <p className="mb-4 text-xs text-gray-500">
        BIN prefix'ine göre hangi kartın hangi processor ile işleneceğini belirleyin.
        En uzun eşleşen prefix kazanır.
      </p>

      <div className="p-4 mb-4 border rounded-lg bg-bg-card border-border">
        <div className="grid grid-cols-4 gap-2">
          <input
            placeholder="İsim (ör. Visa US)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
          />
          <input
            placeholder="BIN (4, 411111)"
            value={form.bin_prefix}
            onChange={(e) => setForm({ ...form, bin_prefix: e.target.value })}
            className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
          />
          <select
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
            className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
          >
            {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
          </select>
          <input
            type="number" placeholder="Prio"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
            className="px-2 py-2 text-xs border rounded bg-bg-input border-border"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <input
            placeholder="Notlar"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="flex-1 px-2 py-2 text-xs border rounded bg-bg-input border-border"
          />
          <button
            onClick={save}
            className="px-4 py-2 text-xs font-bold text-white rounded bg-accent hover:bg-green-600"
          >{editId ? 'Güncelle' : 'Ekle'}</button>
          {editId && (
            <button
              onClick={() => { setEditId(null); setForm(emptyForm); }}
              className="bg-[#555] hover:bg-[#666] text-white px-3 py-2 rounded text-xs"
            >İptal</button>
          )}
        </div>
      </div>

      {error && <div className="mb-3 text-xs text-dead">{error}</div>}

      {loading ? (
        <div className="text-xs text-gray-500">Yükleniyor...</div>
      ) : (
        <table className="w-full overflow-hidden text-xs border rounded-lg bg-bg-card border-border">
          <thead className="bg-[#1f1f1f] text-gray-400">
            <tr>
              <th className="p-2 text-left">İsim</th>
              <th className="p-2 text-left">BIN</th>
              <th className="p-2 text-left">Provider</th>
              <th className="p-2 text-left">Prio</th>
              <th className="p-2 text-left">Durum</th>
              <th className="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2">{r.name}</td>
                <td className="p-2"><button onClick={() => navigate(`/subscriptions?bin=${encodeURIComponent(r.bin_prefix)}`)} className="font-mono text-info underline decoration-dotted hover:text-accent" title="Bu BIN’deki LIVE kartları ve abonelik ön kontrolünü aç">{r.bin_prefix}</button></td>
                <td className="p-2"><code className="text-accent">{r.provider}</code></td>
                <td className="p-2">{r.priority}</td>
                <td className="p-2">{r.is_active ? '✅' : '⛔'}</td>
                <td className="p-2 text-right">
                  <button
                    onClick={() => edit(r)}
                    className="bg-[#333] hover:bg-[#444] text-white px-2 py-1 rounded text-xs mr-1"
                  >✏️</button>
                  <button
                    onClick={() => del(r.id)}
                    className="px-2 py-1 text-xs text-white rounded bg-dead hover:bg-red-700"
                  >🗑️</button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Kural yok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
