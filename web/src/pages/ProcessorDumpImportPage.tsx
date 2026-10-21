import { useEffect, useRef, useState } from 'react';
import { processorDumpsApi, type ProcessorDumpRecord } from '../api/processorDumps';

const DUMP_FIELDS: Record<string, keyof ProcessorDumpRecord> = {
  status: 'status',
  ashstatus: 'ashStatus',
  ashstatusdes: 'statusDescription',
  amount: 'amountMinor',
  currency: 'currency',
  trantype: 'transactionType',
  mti: 'mti',
  creditterms: 'creditTerms',
  brand: 'brand',
  cardtype: 'cardType',
  f39response: 'f39Response',
  panentrymode: 'panEntryMode',
};

function parseDumpLine(line: string): ProcessorDumpRecord | null {
  const parsed: ProcessorDumpRecord = {};
  for (const segment of line.split('|')) {
    const splitAt = segment.indexOf('=');
    if (splitAt < 1) continue;
    const key = segment.slice(0, splitAt).trim().toLowerCase();
    const target = DUMP_FIELDS[key];
    if (!target) continue;
    const value = segment.slice(splitAt + 1).trim();
    if (!value) continue;

    if (target === 'amountMinor') {
      if (!/^\d{1,10}$/.test(value)) continue;
      parsed.amountMinor = Number(value);
    } else if (target === 'statusDescription') {
      parsed.statusDescription = value.slice(0, 80);
    } else {
      const code = value.slice(0, 16);
      if (!/^[A-Za-z0-9_-]+$/.test(code)) continue;
      switch (target) {
        case 'status': parsed.status = code; break;
        case 'ashStatus': parsed.ashStatus = code; break;
        case 'transactionType': parsed.transactionType = code; break;
        case 'mti': parsed.mti = code; break;
        case 'creditTerms': parsed.creditTerms = code; break;
        case 'brand': parsed.brand = code; break;
        case 'cardType': parsed.cardType = code; break;
        case 'f39Response': parsed.f39Response = code; break;
        case 'panEntryMode': parsed.panEntryMode = code; break;
      }
    }
  }
  return Object.keys(parsed).length ? parsed : null;
}

function formatAmount(minor?: number | null, currency?: string | null) {
  if (minor == null) return '—';
  return `${(minor / 100).toFixed(2)} ${currency || ''}`.trim();
}

export default function ProcessorDumpImportPage() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<ProcessorDumpRecord[]>([]);
  const [records, setRecords] = useState<ProcessorDumpRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const result = await processorDumpsApi.list();
      setRecords(result.records);
      setTotal(result.total);
    } catch {
      setMessage('Kayıt listesi alınamadı.');
    }
  }

  useEffect(() => { void refresh(); }, []);

  function parseInput() {
    const raw = inputRef.current?.value || '';
    if (!raw.trim()) {
      setMessage('Önce dump metnini yapıştır.');
      return;
    }
    if (raw.length > 500_000) {
      if (inputRef.current) inputRef.current.value = '';
      setMessage('Metin sınırı aşıldı. En fazla 500 KB kabul ediliyor.');
      return;
    }

    const lines = raw.split(/\r?\n/).filter((line) => line.trim()).slice(0, 500);
    const safeRecords = lines.map(parseDumpLine).filter((record): record is ProcessorDumpRecord => !!record);
    if (inputRef.current) inputRef.current.value = '';
    setPreview(safeRecords);
    setMessage(`${safeRecords.length} satır güvenli alanlara ayrıldı; ${lines.length - safeRecords.length} satır atlandı.`);
  }

  async function importPreview() {
    if (!preview.length) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await processorDumpsApi.import(preview);
      setPreview([]);
      setMessage(`${result.imported} metadata kaydı içeri alındı.`);
      await refresh();
    } catch (error: any) {
      setMessage(error?.response?.data?.error || 'Kayıtlar içeri alınamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="bg-bg-card border border-border rounded-lg p-5">
        <h1 className="text-accent font-bold text-lg mb-2">Processor dump içe aktarımı</h1>
        <p className="text-sm text-gray-400 mb-4">
          Dump satırları tarayıcıda ayıklanır. Yalnızca durum, tutar, para birimi ve işlem kodları sunucuya gönderilir.
          Kart numarası, Track2, son kullanma tarihi, ad, telefon, RRN, UID ve provizyon kodları kaydedilmez.
        </p>
        <textarea
          ref={inputRef}
          onChange={() => setMessage('')}
          placeholder="status=...|amount=...|currency=...|f39Response=..."
          className="w-full min-h-36 bg-bg-input border border-border rounded-md p-3 font-mono text-xs mb-3 focus:border-accent outline-none resize-y"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex gap-2">
          <button onClick={parseInput} className="bg-info hover:opacity-90 text-white px-4 py-2 rounded text-sm font-bold">
            Ayıkla ve önizle
          </button>
          <button onClick={() => { setPreview([]); if (inputRef.current) inputRef.current.value = ''; setMessage('Alan temizlendi.'); }} className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm">
            Temizle
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-gray-300" role="status">{message}</p>}
      </section>

      {preview.length > 0 && (
        <section className="bg-bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-bold">İçe aktarım önizlemesi ({preview.length})</h2>
            <button disabled={busy} onClick={importPreview} className="bg-accent hover:bg-green-600 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold">
              {busy ? 'Kaydediliyor…' : 'Güvenli metadatayı kaydet'}
            </button>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="text-gray-400 border-b border-border"><th className="p-2">Durum</th><th className="p-2">Açıklama</th><th className="p-2">Tutar</th><th className="p-2">İşlem</th><th className="p-2">MTI</th><th className="p-2">Yanıt</th><th className="p-2">Marka kodu</th></tr></thead>
              <tbody>{preview.map((record, index) => <tr key={index} className="border-b border-border/60">
                <td className="p-2">{record.status || record.ashStatus || '—'}</td>
                <td className="p-2">{record.statusDescription || '—'}</td>
                <td className="p-2">{formatAmount(record.amountMinor, record.currency)}</td>
                <td className="p-2">{record.transactionType || '—'}</td>
                <td className="p-2">{record.mti || '—'}</td>
                <td className="p-2">{record.f39Response || '—'}</td>
                <td className="p-2">{record.brand || '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      <section className="bg-bg-card border border-border rounded-lg p-5">
        <h2 className="font-bold mb-3">İçe aktarılan kayıtlar ({total})</h2>
        <div className="overflow-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="text-gray-400 border-b border-border"><th className="p-2">Tarih</th><th className="p-2">Durum</th><th className="p-2">Açıklama</th><th className="p-2">Tutar</th><th className="p-2">İşlem</th><th className="p-2">Yanıt</th><th className="p-2">MTI</th></tr></thead>
            <tbody>{records.map((record) => <tr key={record.id} className="border-b border-border/60">
              <td className="p-2">{record.importedAt ? new Date(record.importedAt).toLocaleString('tr-TR') : '—'}</td>
              <td className="p-2">{record.status || record.ashStatus || '—'}</td>
              <td className="p-2">{record.statusDescription || '—'}</td>
              <td className="p-2">{formatAmount(record.amountMinor, record.currency)}</td>
              <td className="p-2">{record.transactionType || '—'}</td>
              <td className="p-2">{record.f39Response || '—'}</td>
              <td className="p-2">{record.mti || '—'}</td>
            </tr>)}</tbody>
          </table>
          {!records.length && <p className="text-sm text-gray-500 p-3">Henüz içe aktarılan kayıt yok.</p>}
        </div>
      </section>
    </div>
  );
}
