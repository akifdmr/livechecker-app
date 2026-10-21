// ============================================================
// components/ErrorBoundary.tsx
// Tüm app'i saran hata yakalayıcı (React error boundary).
// Route seviyesinde değil, App seviyesinde kullanılmalı.
// ============================================================
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Opsiyonel: kendi fallback ekranını göstermek istersen */
  fallback?: ReactNode;
  /** Hata loglama callback'i (Sentry, kendi logger'ın vs.) */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Konsola her zaman yaz
    console.error('[ErrorBoundary]', error, info.componentStack);

    // Dış logger'a forward et
    this.props.onError?.(error, info);

    // İsteğe bağlı: localStorage'a son hatayı yaz (debug için)
    try {
      localStorage.setItem(
        'last_error',
        JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
          at: new Date().toISOString(),
        })
      );
    } catch {
      /* ignore */
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const message =
      (this.state.error && (this.state.error.message || String(this.state.error))) ||
      'Bilinmeyen bir hata oluştu';

    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-gradient-to-br from-gray-900 to-black">
        <div className="w-full max-w-2xl p-8 border-2 shadow-2xl bg-bg-card border-dead rounded-xl">
          <div className="mb-6 text-center">
            <div className="mb-3 text-5xl">⚠️</div>
            <h1 className="mb-2 text-xl font-bold text-dead">
              Bir şeyler ters gitti
            </h1>
            <p className="text-xs text-gray-400">
              Uygulama beklenmedik bir hatayla karşılaştı. Aşağıdaki hata detayını
              geliştiriciye iletebilirsin.
            </p>
          </div>

          <div className="p-3 mb-5 overflow-auto border rounded-md bg-bg-input border-border max-h-48">
            <pre className="text-[11px] text-warn font-mono whitespace-pre-wrap break-words">
              {message}
            </pre>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm font-bold text-white rounded-md bg-accent hover:bg-green-600"
            >
              🔄 Tekrar Dene
            </button>
            <button
              onClick={this.handleGoHome}
              className="bg-[#333] hover:bg-[#444] text-white px-4 py-2 rounded-md text-sm"
            >
              🏠 Dashboard
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 text-sm font-bold text-white rounded-md bg-dead hover:bg-red-700"
            >
              ⟳ Sayfayı Yenile
            </button>
          </div>

          <details className="mt-5">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
              Teknik detay (stack trace)
            </summary>
            <pre className="mt-2 text-[10px] text-gray-500 font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto p-2 bg-[#0d0d0d] rounded">
              {this.state.error?.stack || 'Stack yok'}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}