import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { subscriptionApi } from '../api';

interface SubscriptionCard {
  id: number;
  holder_name: string;
  exp: string;
  type?: string;
  banka?: string;
  status: string;
  last4: string;
  net_collected: number | string;
  last_payment_at?: string;
  last_decline?: string;
}

export default function SubscriptionChecksPage() {
  const [searchParams] = useSearchParams();
  const binFilter = (searchParams.get('bin') || '').replace(/\D/g, '');
  const [cards, setCards] = useState<SubscriptionCard[]>([]);
  const [checks, setChecks] = useState<Record<number, any>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [checkingAll, setCheckingAll] = useState(false);

  async function load() {
    try {
      setCards(await subscriptionApi.cards());
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function checkCard(id: number) {
    setBusyId(id);
    try {
      const result = await subscriptionApi.preflight(id);
      setChecks((current) => ({ ...current, [id]: result.check }));
    } catch (e: any) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function checkAll() {
    setCheckingAll(true);
    setError('');
    for (const card of visible) {
      try {
        const result = await subscriptionApi.preflight(card.id);
        setChecks((current) => ({ ...current, [card.id]: result.check }));
      } catch (e: any) {
        setError(e.response?.data?.error || e.message || `#${card.id} ön kontrolü tamamlanamadı.`);
      }
    }
    setCheckingAll(false);
  }

  const visible = cards.filter((card) => {
    const panBin = String((card as any).bin || '');
    const sameBin = !binFilter || panBin.startsWith(binFilter);
    const isLive = !binFilter || String(card.status || '').toUpperCase() === 'LIVE';
    return sameBin && isLive && `${card.holder_name} ${card.last4} ${card.banka || ''}`.toLowerCase().includes(query.toLowerCase());
  });
  const readyCards = visible.filter((card) => checks[card.id]?.outcome === 'ready');
  const reviewCards = visible.filter((card) => checks[card.id] && checks[card.id].outcome !== 'ready');
  const uncheckedCards = visible.filter((card) => !checks[card.id]);

  function renderRows(list: SubscriptionCard[]) {
    return list.map((card) => {
      const check = checks[card.id];
      return <tr key={card.id} className="border-t border-border align-top"><td className="p-2">{card.holder_name || '-'}</td><td className="p-2 font-mono">•••• {card.last4 || '----'}</td><td className="p-2">{card.exp || '-'}</td><td className="p-2">{card.status || 'Bilinmiyor'}</td><td className="p-2">${Number(card.net_collected || 0).toFixed(2)}</td><td className="p-2">{card.last_payment_at ? new Date(card.last_payment_at).toLocaleString('tr-TR') : '-'}</td><td className="max-w-xs p-2 text-warn">{card.last_decline || '-'}</td><td className="p-2"><button disabled={busyId !== null || checkingAll} onClick={() => checkCard(card.id)} className="rounded bg-accent px-2 py-1 font-semibold text-white disabled:opacity-50">{busyId === card.id ? 'Kontrol ediliyor…' : check ? 'Yeniden ön kontrol' : 'Ön kontrol'}</button>{check && <div className={`mt-2 max-w-xs ${check.outcome === 'ready' ? 'text-live' : 'text-warn'}`}><strong>{check.outcome === 'ready' ? 'Kayıt kontrolü uygun' : 'İnceleme gerekli'}</strong><ul className="mt-1 list-disc pl-4 text-gray-300">{(check.findings || []).map((finding: string, index: number) => <li key={index}>{finding}</li>)}</ul><small className="text-gray-500">Provider doğrulaması yapılmadı · Ücret alınmadı</small></div>}</td></tr>;
    });
  }

  const tableHead = <thead className="text-gray-400"><tr><th className="p-2">Holder adı / soyadı</th><th className="p-2">Kart</th><th className="p-2">Son kullanım</th><th className="p-2">Durum</th><th className="p-2">Net tahsilat</th><th className="p-2">Son ödeme</th><th className="p-2">Son red</th><th className="p-2">Ön kontrol</th></tr></thead>;

  return (
    <section className="rounded-lg border border-border bg-bg-card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-lg font-bold text-accent">{binFilter ? `BIN ${binFilter} · LIVE abonelik kartları` : 'Abonelik kartları · çekim öncesi check'}</h1><p className="mt-1 max-w-3xl text-xs text-gray-400">Bu kontrol yalnızca kayıtlı ad, son kullanma tarihi ve önceki ödeme sonucunu inceler. Bankaya veya ödeme sağlayıcısına istek göndermez ve kartın ödeme alabileceğini doğrulamaz.</p></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Holder adı veya son 4 hane" className="rounded border border-border bg-bg-input px-3 py-2 text-xs" />
        {binFilter && <button disabled={!visible.length || checkingAll} onClick={checkAll} className="rounded bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{checkingAll ? 'Tüm kayıtlar kontrol ediliyor…' : `Tüm ${visible.length} kaydı ön kontrol et`}</button>}
      </div>
      {error && <p className="mb-3 text-sm text-dead">{error}</p>}
      {visible.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{cards.length ? 'Bu BIN’de LIVE kart veya aramayla eşleşen kayıt yok.' : 'Abonelik kartı bulunamadı.'}</p> : <div className="space-y-5 overflow-auto">
        {readyCards.length > 0 && <section><h2 className="mb-2 font-bold text-live">Ön kontrol uygun ({readyCards.length})</h2><table className="w-full text-left text-xs">{tableHead}<tbody>{renderRows(readyCards)}</tbody></table></section>}
        {reviewCards.length > 0 && <section><h2 className="mb-2 font-bold text-warn">İnceleme gerekli ({reviewCards.length})</h2><table className="w-full text-left text-xs">{tableHead}<tbody>{renderRows(reviewCards)}</tbody></table></section>}
        {uncheckedCards.length > 0 && <section><h2 className="mb-2 font-bold text-gray-400">Henüz ön kontrol edilmedi ({uncheckedCards.length})</h2><table className="w-full text-left text-xs">{tableHead}<tbody>{renderRows(uncheckedCards)}</tbody></table></section>}
      </div>}
    </section>
  );
}
