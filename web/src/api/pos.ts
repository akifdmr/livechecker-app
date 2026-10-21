import { api } from './client';

// ⭐ v8: Her değeri güvenli string'e çevirir — obje sızmasını engeller
function toMsg(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    if (typeof v.message === 'string') return v.message;
    if (typeof v.error === 'string') return v.error;
    if (v.error && typeof v.error.message === 'string') return v.error.message;
    if (typeof v.reasonLong === 'string') return v.reasonLong;
    if (typeof v.reason === 'string') return v.reason;
    try {
      const s = JSON.stringify(v);
      return s.length > 500 ? s.slice(0, 500) + '…' : s;
    } catch {
      return null;
    }
  }
  return String(v);
}

// ⭐ v8: Axios hatasını normalize edip yeniden fırlatır.
//    Böylece üst katman `e.message`'ı her zaman string olarak okur.
function normalizeError(e: any): Error {
  const data = e?.response?.data;
  const msg =
    toMsg(data?.error) ||
    toMsg(data?.message) ||
    toMsg(data?.reasonLong) ||
    toMsg(data?.reason) ||
    toMsg(e?.message) ||
    'Bilinmeyen hata';

  const err: any = new Error(msg);
  err.status = e?.response?.status;
  err.original = e;
  // ⭐ Backend'in ham yanıtını da koru (success=false detayları için)
  err.data = data;
  return err;
}

// ⭐ v8: Başarılı yanıtlarda da `error` alanı string'e zorlanır
function normalizeData(d: any): any {
  if (d == null || typeof d !== 'object') return d;
  if (Array.isArray(d)) return d.map(normalizeData);

  const out: any = { ...d };
  if ('error' in out) {
    out.error = toMsg(out.error);
  }
  if ('message' in out && typeof out.message !== 'string') {
    out.message = toMsg(out.message);
  }
  if ('reasonLong' in out && typeof out.reasonLong !== 'string') {
    out.reasonLong = toMsg(out.reasonLong);
  }
  if ('providerMessage' in out && typeof out.providerMessage !== 'string') {
    out.providerMessage = toMsg(out.providerMessage);
  }
  return out;
}

async function wrap<T>(p: Promise<{ data: T }>): Promise<T> {
  try {
    const res = await p;
    return normalizeData(res.data);
  } catch (e) {
    throw normalizeError(e);
  }
}

export const posApi = {
  providers: () => wrap<{ providers: any[] }>(api.get('/pos/providers')),

  enrollments: () => wrap<{ enrollments: any[] }>(api.get('/pos/enrollments')),

  createEnrollment: (payload: any) =>
    wrap(api.post('/pos/enrollments', payload)),

  updateEnrollment: (id: number, payload: any) =>
    wrap(api.patch(`/pos/enrollments/${id}`, payload)),

  pay: (payload: any) =>
    wrap(api.post('/pos/payments', payload)),

  transactions: (limit = 100) =>
    wrap<{ transactions: any[] }>(api.get('/pos/transactions', { params: { limit } })),

  refreshTransaction: (id: number) =>
    wrap(api.post(`/pos/transactions/${id}/refresh`)),

  action: (id: number, payload: any) =>
    wrap(api.post(`/pos/transactions/${id}/action`, payload)),
};
