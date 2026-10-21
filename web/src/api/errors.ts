// src/api/errors.ts
export interface ParsedApiError {
  message: string;
  code: string | null;
  status: number | null;
  fieldErrors?: Record<string, string[]>;
  requestId: string | null;
  raw: unknown;
}

function pickString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const o = v as any;
    return (
      pickString(o.message) ??
      pickString(o.error) ??
      pickString(o.reason) ??
      null
    );
  }
  return null;
}

export function parseApiError(e: unknown): ParsedApiError {
  const err = e as any;
  const res = err?.response;
  const data = res?.data ?? err?.data ?? {};
  const status = res?.status ?? err?.status ?? null;

  const message =
    pickString(data?.error) ??
    pickString(data?.message) ??
    pickString(data?.reasonLong) ??
    pickString(data?.reason) ??
    pickString(err?.message) ??
    'Bilinmeyen bir hata oluştu';

  const fieldErrors: Record<string, string[]> = {};
  if (Array.isArray(data?.details)) {
    for (const d of data.details) {
      if (d && typeof d.path === 'string') {
        (fieldErrors[d.path] ??= []).push(String(d.message || ''));
      }
    }
  }

  return {
    message,
    code: pickString(data?.code ?? data?.providerCode),
    status,
    fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
    requestId: pickString(data?.requestId ?? res?.headers?.['x-request-id']),
    raw: data,
  };
}