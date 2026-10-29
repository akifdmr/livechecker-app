// ============================================================
// src/components/AdminUserPicker.tsx
// Admin'in kullanıcı seçebileceği dropdown.
// useAuthStore'da admin değilse render etmez.
// ============================================================
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

type UserOption = {
  id: number;
  username: string;
  email: string | null;
  live_cards_count?: number;
};

type Props = {
  value: number | null;
  onChange: (userId: number | null) => void;
  /** "all" seçeneğini de sun (default true) */
  includeAll?: boolean;
  /** Etiket */
  label?: string;
};

const API_BASE = import.meta.env.VITE_API_URL || '';

export function AdminUserPicker({
  value,
  onChange,
  includeAll = true,
  label = 'Kullanıcı',
}: Props) {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const token = useAuthStore((s) => s.token);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    fetch(`${API_BASE}/api/admin/users?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [isAdmin, token]);

  if (!isAdmin) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label style={{ fontSize: 13, color: '#555' }}>{label}:</label>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : parseInt(v, 10));
        }}
        disabled={loading}
        style={{ padding: '6px 10px', minWidth: 220 }}
      >
        {includeAll && <option value="">— Tüm Kullanıcılar —</option>}
        {!includeAll && <option value="">— Seç —</option>}
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username} {u.email ? `(${u.email})` : ''}
            {typeof u.live_cards_count === 'number'
              ? ` • ${u.live_cards_count} kart`
              : ''}
          </option>
        ))}
      </select>
    </div>
  );
}