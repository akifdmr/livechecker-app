// ============================================================
// LOGIN PAGE
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import AnimatedLogo from '../components/AnimatedLogo';
import { useAuthStore } from '../stores/authStore';

export default function Login() {
  const [email, setEmail] = useState('developerakifx@gmail.com');
  const [password, setPassword] = useState('Test123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authApi.login(email, password);
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

        {error && (
          <div className="mb-4 text-xs text-center text-red-500">{error}</div>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-3 py-3 mb-4 text-sm bg-gray-800 border border-gray-700 rounded-md outline-none focus:border-accent"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Şifre"
          className="w-full px-3 py-3 mb-6 text-sm bg-gray-800 border border-gray-700 rounded-md outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 font-bold text-white transition rounded-md bg-accent hover:bg-green-600 disabled:bg-gray-600"
        >
          {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}