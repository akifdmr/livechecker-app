import { useEffect, useState } from 'react';
import { adminApi } from '../../api';
import AddUserModal from './AddUserModal';

export default function UsersSection({
  onStatsChanged,
}: {
  onStatsChanged?: () => void;
}) {
  const [users, setUsers] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const users = await adminApi.users();
      setUsers(users);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete(id: number, email: string) {
    if (!confirm(`${email} silinsin mi?`)) return;
    try {
      await adminApi.deleteUser(id);
      await loadUsers();
      onStatsChanged?.();
    } catch (e: any) {
      alert(e.response?.data?.error || e.message);
    }
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg p-5">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-accent font-bold text-lg">👥 Kullanıcılar</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-accent hover:bg-green-600 text-white px-4 py-2 rounded-md text-xs font-bold"
        >
          ➕ Ekle
        </button>
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <div
            key={u.id}
            className="bg-bg-input border border-border rounded-md p-3 flex items-center justify-between"
          >
            <div>
              <div className="text-info text-sm font-mono">{u.email}</div>
              <div className="text-[10px] text-gray-500 mt-1">
                {u.role} | Kart: {u.card_count} | Check: {u.check_count}
              </div>
            </div>
            <button
              onClick={() => handleDelete(u.id, u.email)}
              className="bg-dead hover:bg-red-700 text-white px-3 py-1 rounded text-xs"
            >
              Sil
            </button>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            loadUsers();
            onStatsChanged?.();
          }}
        />
      )}
    </div>
  );
}