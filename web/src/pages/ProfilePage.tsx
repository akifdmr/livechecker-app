import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { authApi } from '../api';
import { useAuthStore } from '../stores/authStore';

const inputClass = 'w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm outline-none focus:border-accent';

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const logout = useAuthStore((state) => state.logout);
  const [username, setUsername] = useState(user?.username || '');
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);

  async function loadSessions() {
    try { setSessions(await authApi.sessions()); } catch { /* auth interceptor handles expired sessions */ }
  }

  useEffect(() => { void loadSessions(); }, []);

  useEffect(() => {
    setUsername(user?.username || '');
    setDisplayName(user?.display_name || '');
  }, [user?.username, user?.display_name]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage(''); setBusy(true);
    try {
      const updated = await authApi.updateProfile({
        username, displayName,
        ...(newPassword ? { currentPassword, newPassword } : {}),
      });
      updateUser(updated);
      setUsername(updated.username); setDisplayName(updated.display_name || '');
      setCurrentPassword(''); setNewPassword('');
      setMessage('Hesap bilgileri güncellendi.');
      if (newPassword) {
        logout();
        window.location.replace('/login');
      }
    } catch (cause: any) {
      setError(cause.response?.data?.error || cause.message || 'Güncelleme başarısız.');
    } finally { setBusy(false); }
  }

  async function revokeSession(id: string, current: boolean) {
    setError('');
    try {
      await authApi.revokeSession(id);
      if (current) { logout(); window.location.replace('/login'); return; }
      await loadSessions();
      setMessage('Oturum kapatıldı.');
    } catch (cause: any) { setError(cause.response?.data?.error || 'Oturum kapatılamadı.'); }
  }

  async function revokeAll() {
    setError('');
    try {
      await authApi.logoutAll();
      logout();
      window.location.replace('/login');
    } catch (cause: any) { setError(cause.response?.data?.error || 'Oturumlar kapatılamadı.'); }
  }

  return <section className="mx-auto max-w-2xl rounded-lg border border-border bg-bg-card p-6">
    <h1 className="mb-1 text-xl font-bold text-accent">Hesap bilgilerim</h1>
    <p className="mb-6 text-sm text-gray-400">Kendi profil bilgilerini ve giriş şifreni yönet.</p>
    <div className="mb-5 grid grid-cols-2 gap-3 rounded-md border border-border p-4 text-sm">
      <div><span className="text-gray-500">Rol</span><div>{user?.role || '-'}</div></div>
      <div><span className="text-gray-500">Kredi</span><div>{Number(user?.credits || 0).toFixed(2)}</div></div>
    </div>
    <form onSubmit={save} className="space-y-4">
      <label className="block space-y-1 text-xs text-gray-400">Ad Soyad<input className={inputClass} value={displayName} maxLength={120} onChange={(e) => setDisplayName(e.target.value)} /></label>
      <label className="block space-y-1 text-xs text-gray-400">Username<input className={inputClass} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]{3,32}" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /><span className="text-[11px] text-gray-500">3-32 karakter: harf, rakam, nokta, tire veya alt çizgi. Kullanıcı adı benzersiz olmalı.</span></label>
      {user?.email && <div className="text-xs text-gray-400">İletişim emaili: {user.email}</div>}
      <div className="rounded-md border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Şifre değiştir</h2>
        <div className="space-y-3">
          <input className={inputClass} type="password" autoComplete="current-password" placeholder="Mevcut şifre" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          <input className={inputClass} type="password" autoComplete="new-password" minLength={8} placeholder="Yeni şifre (en az 8 karakter)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
      </div>
      {message && <p className="text-sm text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Kaydediliyor…' : 'Bilgileri Kaydet'}</button>
    </form>
    <div className="mt-8 border-t border-border pt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">Açık oturumlar</h2><p className="mt-1 text-xs text-gray-500">IP adresi, cihaz kimliği veya tarayıcı parmak izi tutulmaz.</p></div>
        <button type="button" onClick={revokeAll} className="rounded border border-red-500/40 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">Tüm oturumları kapat</button>
      </div>
      <div className="space-y-2">{sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-border p-3 text-xs">
        <div><div className="font-medium">{session.current ? 'Bu oturum' : 'Diğer oturum'}</div><div className="mt-1 text-gray-500">Son etkinlik: {new Date(session.last_seen_at).toLocaleString()}</div><div className="text-gray-500">Bitiş: {new Date(session.expires_at).toLocaleString()}</div></div>
        <button type="button" onClick={() => revokeSession(session.id, session.current)} className="rounded border border-border px-3 py-2 hover:bg-white/5">Oturumu kapat</button>
      </div>)}{sessions.length === 0 && <p className="text-xs text-gray-500">Açık oturum bulunamadı.</p>}</div>
    </div>
  </section>;
}
