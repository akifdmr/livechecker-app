import { useState } from 'react';
import { api } from '../api';

type CheckoutSessionResponse = {
  sessionId: string;
  checkoutUrl: string;
};

export default function StripeCheckoutPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');
    try {
      const response = await api.post<CheckoutSessionResponse>('/payments/stripe/checkout-session');
      const checkoutUrl = response.data?.checkoutUrl;
      if (!checkoutUrl || !checkoutUrl.startsWith('https://checkout.stripe.com/')) {
        throw new Error('Stripe Checkout bağlantısı alınamadı.');
      }
      window.location.assign(checkoutUrl);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || requestError.message || 'Checkout başlatılamadı.');
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Aboneliğini başlat</h1>
        <p className="mt-2 text-sm text-gray-400">
          Ödeme adımını Stripe’ın güvenli Checkout sayfasında tamamlayacaksın.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#11151d] shadow-xl">
        <div className="grid md:grid-cols-[minmax(0,1fr)_1.2fr]">
          <div className="min-h-64 bg-[#0d1017]">
            <img
              src="https://i.imgur.com/EHyR2nP.png"
              alt="Stubborn Attachments kitap kapağı"
              className="h-full min-h-64 w-full object-cover"
            />
          </div>

          <div className="flex flex-col p-6 sm:p-8">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Aylık abonelik</p>
              <h2 className="mt-3 text-2xl font-bold text-white">Stubborn Attachments</h2>
              <p className="mt-3 text-sm leading-6 text-gray-400">
                Aboneliği Stripe Checkout üzerinden güvenle başlat. Kart bilgilerin bu uygulamaya gönderilmez.
              </p>
            </div>

            <div className="my-7 border-t border-white/10 pt-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-gray-400">Aylık ücret</span>
                <span className="text-2xl font-bold text-white">$20.00</span>
              </div>
            </div>

            {error && (
              <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={startCheckout}>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-accent px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? 'Stripe Checkout açılıyor…' : 'Checkout’a geç'}
              </button>
            </form>
            <p className="mt-3 text-center text-xs text-gray-500">Ödeme Stripe tarafından işlenir.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
