import { useState } from 'react';
import { adminApi } from '../../api';

interface AddUserModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function AddUserModal({
  onClose,
  onCreated,
}: AddUserModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError('');
    if (!username || !password) {
      setError('Username ve şifre gerekli');
      return;
    }

    setLoading(true);
    try {
      await adminApi.addUser(username, password, role);
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border-2 border-accent rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-accent font-bold text-lg mb-4">
          ➕ Yeni Kullanıcı
        </h3>

        <input
          type="text"
          placeholder="Username"
          value={username}
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_.-]{3,32}"
          onChange={(e) => setUsername(e.target.value)}
          className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm mb-3 focus:border-accent outline-none"
        />
        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm mb-3 focus:border-accent outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          className="w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm mb-3 focus:border-accent outline-none"
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>

        {error && <div className="text-dead text-xs mb-3">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-accent hover:bg-green-600 disabled:bg-gray-600 text-white py-2 rounded-md text-sm font-bold"
          >
            {loading ? 'Oluşturuluyor...' : 'Oluştur'}
          </button>
          <button
            onClick={onClose}
            className="bg-[#555] hover:bg-[#666] text-white px-4 py-2 rounded-md text-sm"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}
