import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

type CheckoutStatus = {
  status: 'complete' | 'open' | 'expired' | null;
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required' | null;
  subscriptionCreated: boolean;
};

export default function StripeCheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      setError('Checkout oturum bilgisi bulunamadı.');
      setLoading(false);
      return () => { active = false; };
    }

    api.get<CheckoutStatus>(`/payments/stripe/checkout-session/${encodeURIComponent(sessionId)}/status`)
      .then((response) => { if (active) setStatus(response.data); })
      .catch((requestError: any) => {
        if (active) setError(requestError.response?.data?.error || 'Checkout durumu doğrulanamadı.');
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [sessionId, refreshCount]);

  const paid = status?.status === 'complete' &&
    (status.paymentStatus === 'paid' || status.paymentStatus === 'no_payment_required') &&
    status.subscriptionCreated;
  const processing = status?.status === 'complete' && !paid;

  return (
    <main className="mx-auto max-w-2xl py-12">
      <section className="rounded-2xl border border-white/10 bg-[#11151d] p-7 text-center shadow-xl sm:p-10">
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full ${paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-accent/15 text-accent'}`}>
          {loading ? <span className="text-2xl">…</span> : paid ? <span className="text-2xl">✓</span> : <span className="text-2xl">{processing ? '↻' : '!'}</span>}
        </div>

        <h1 className="text-2xl font-bold text-white">
          {loading ? 'Ödeme doğrulanıyor…' : paid ? 'Siparişiniz için teşekkürler!' : processing ? 'Ödeme işleniyor' : 'Ödeme henüz doğrulanamadı'}
        </h1>

        <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-gray-400">
          {loading
            ? 'Stripe Checkout oturumunuz güvenli şekilde kontrol ediliyor.'
            : paid
              ? 'İşleminiz Stripe tarafından doğrulandı ve aboneliğiniz oluşturuldu.'
              : processing
                ? 'Stripe ödemenizi tamamlıyor. Yeni bir Checkout başlatmadan önce durumu yeniden kontrol edin.'
                : error || 'Checkout tamamlanmadı veya bu oturum hesabınızla eşleşmiyor.'}
        </p>

        {!loading && (
          <div className="mt-7 space-y-3">
            {paid && (
              <p className="text-sm text-gray-400">
                Sorularınız için <a className="text-accent hover:underline" href="mailto:orders@example.com">orders@example.com</a> adresine e-posta gönderebilirsiniz.
              </p>
            )}
            {processing ? (
              <button
                type="button"
                onClick={() => { setLoading(true); setError(''); setRefreshCount((count) => count + 1); }}
                className="rounded-lg bg-accent px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
              >
                Durumu yeniden kontrol et
              </button>
            ) : (
              <Link
                to={paid ? '/dashboard' : '/stripe-checkout'}
                className="inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
              >
                {paid ? 'Panele dön' : 'Checkout’a geri dön'}
              </Link>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
