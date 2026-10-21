import { useEffect, useState } from 'react';
import { adminApi } from '../api';

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  async function load() {
    const r = await adminApi.rbac();
    setRoles(r.roles || []);
    setPermissions(r.permissions || []);
  }
  useEffect(() => { load(); }, []);

  function choose(role: any) {
    setSelected(role);
    setChecked((role.permissions || []).map((p: any) => p.key));
    setMessage('');
  }

  async function save() {
    if (!selected) return;
    await adminApi.updateRolePermissions(selected.id, checked);
    setMessage('Yetkiler kaydedildi.');
    await load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">🛡️ Aksiyon Bazlı Roller</h1>
        <p className="mt-1 text-sm text-gray-400">Kullanıcıyı tek bir genel role bağlamak yerine hangi işlemleri yapabileceğini tek tek belirleyin.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-white/10 bg-[#11151d] p-3">
          {roles.map(r => (
            <button key={r.id} onClick={()=>choose(r)} className={`mb-2 w-full rounded-lg p-3 text-left ${selected?.id===r.id?'bg-accent/15 text-accent':'bg-black/20 text-gray-300'}`}>
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs text-gray-500">{r.description}</div>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-[#11151d] p-5">
          {!selected ? <div className="py-16 text-center text-gray-500">Bir rol seçin.</div> : <>
            <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">{selected.name}</h2><p className="text-xs text-gray-500">{selected.description}</p></div><button onClick={save} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold">Kaydet</button></div>
            <div className="grid gap-2 md:grid-cols-2">
              {permissions.map(p => {
                const on = checked.includes(p.key);
                return <label key={p.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${on?'border-accent/40 bg-accent/5':'border-white/10 bg-black/10'}`}>
                  <input type="checkbox" checked={on} onChange={e=>setChecked(v=>e.target.checked?[...v,p.key]:v.filter(x=>x!==p.key))}/>
                  <div><div className="text-sm">{p.label}</div><div className="text-[11px] text-gray-500 font-mono">{p.key}</div></div>
                </label>
              })}
            </div>
            {message && <div className="mt-4 text-sm text-emerald-300">✓ {message}</div>}
          </>}
        </div>
      </div>
    </div>
  );
}
