// ============================================================
// LOGIN PAGE
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import AnimatedLogo from '../components/AnimatedLogo';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) await authApi.register(username, password, displayName);
      const result = await authApi.login(username, password);
      if (!result.token) throw new Error('Token alınamadı');
      login(result.token, result.user);
      navigate('/dashboard');
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-black">
      <form
        onSubmit={handleLogin}
        className="w-[420px] bg-bg-card border-2 border-accent rounded-xl p-10 shadow-2xl"
      >
        {/* ⭐ Animated Logo */}
        <div className="flex justify-center mb-8">
          <AnimatedLogo size={120} withText={true} />
        </div>

        <div className="mb-5 flex rounded-md bg-gray-800 p-1 text-xs">
          <button type="button" onClick={() => { setIsRegister(false); setError(''); }} className={`flex-1 rounded px-3 py-2 ${!isRegister ? 'bg-accent text-white' : 'text-gray-400'}`}>Giriş Yap</button>
          <button type="button" onClick={() => { setIsRegister(true); setError(''); }} className={`flex-1 rounded px-3 py-2 ${isRegister ? 'bg-accent text-white' : 'text-gray-400'}`}>Yeni Hesap Oluştur</button>
        </div>

        {error && (
          <div className="mb-4 text-xs text-center text-red-500">{error}</div>
        )}

        {isRegister && <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Ad Soyad (isteğe bağlı)"
          autoComplete="name"
          className="w-full px-3 py-3 mb-4 text-sm bg-gray-800 border border-gray-700 rounded-md outline-none focus:border-accent"
        />}

        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          minLength={3}
          maxLength={32}
          pattern="[A-Za-z0-9_.-]{3,32}"
          required
          className="w-full px-3 py-3 mb-4 text-sm bg-gray-800 border border-gray-700 rounded-md outline-none focus:border-accent"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Şifre"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          className="w-full px-3 py-3 mb-6 text-sm bg-gray-800 border border-gray-700 rounded-md outline-none focus:border-accent"
        />

        {isRegister && <p className="-mt-3 mb-4 text-xs text-gray-400">Yeni hesaplar 0 krediyle açılır. Kredi yüklenene kadar işlem yapılamaz.</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 font-bold text-white transition rounded-md bg-accent hover:bg-green-600 disabled:bg-gray-600"
        >
          {loading ? (isRegister ? 'Hesap oluşturuluyor...' : 'Giriş yapılıyor...') : (isRegister ? 'Hesap Oluştur' : 'Giriş Yap')}
        </button>
      </form>
    </div>
  );
}
