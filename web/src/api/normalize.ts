// ============================================================
// BALANCE NORMALIZER — defensive
// ============================================================
import type { BalanceResult } from './types';


export function normalizeBalance(raw: any): BalanceResult {
  const d = raw || {};
  return {
    success: d.success === true,
    status: d.status || (d.success ? 'LIVE' : 'DEAD'),
    reason: d.reason || (d.success ? 'approved' : 'declined'),
    reasonShort: d.reasonShort ?? null,
    reasonLong: d.reasonLong ?? null,
    severity: d.severity ?? null,
    rawMessage: d.rawMessage ?? null,
    provider: d.provider ?? null,
    providerKey: d.providerKey ?? d.provider ?? null,        // ⭐ EKLENDİ
    providerCode: d.providerCode ?? null,                     // ⭐ EKLENDİ
        merchantId: d.merchantId ?? null,
    merchantName: d.merchantName ?? null,
    message: d.message ?? null,
    providerMessage: d.providerMessage ?? d.message ?? d.error?.message ?? null,
    operation: d.operation ?? null,
    amount: typeof d.amount === 'number' ? d.amount : 0,
    currency: d.currency || 'USD',
    authCode: d.authCode ?? null,
    transactionId: d.transactionId ?? d.chargeId ?? null,
    txnId: d.txnId ?? null,
    refundedAmount: typeof d.refundedAmount === 'number' ? d.refundedAmount : 0,
    netAmount: typeof d.netAmount === 'number' ? d.netAmount : null,
    capturedAmount: typeof d.capturedAmount === 'number' ? d.capturedAmount : undefined,
    voided: d.voided === true,
    error: d.error ?? null,
    bin: d.bin ?? null,
    attempts: Array.isArray(d.attempts) ? d.attempts : [],
    duration: d.duration ?? null,
    raw: d,
  };
}
