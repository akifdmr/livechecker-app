// ============================================================
// API INDEX — Merkezi Export (Barrel)
// ============================================================

export { api } from './client';

export { readNdjson } from './stream';

export { normalizeBalance } from './normalize';

// ============================================================
// TYPES
// ============================================================

export type {
  ApiKeyInfo, BalanceResult, BankAccount, Card, CardBalance, ChargeOperation,
  ChargePayload,
  CheckStreamOpts, Collection, FavList, IntelQueryResult, Load, LoadCard, ProcessorRule
} from './types';

// ============================================================
// SUB-MODULES
// ============================================================

export { authApi } from './auth';

export { cardsApi } from './cards';

export { binApi } from './bin';

export { favoritesApi } from './favorites';

export { checkApi } from './check';

export { importApi } from './import';

export { processorDumpsApi } from './processorDumps';
export type { ProcessorDumpRecord } from './processorDumps';

export {
  adminApi,
  binHistoryApi,
  subscriptionApi
} from './admin';

export { chargeApi } from './charge';

export { processorRoutingApi } from './processorRouting';

// ============================================================
// PROVIDER TRANSACTIONS
// ============================================================

export { providerTransactionsApi } from './providerTransactions';

export type {
  ProviderTxnFilters, ProviderTxnSummaryParams
} from './providerTransactions';
// ============================================================
// BANK
// ============================================================

export {
  bankApi, collectionApi, loadApi, loadCardApi, processorAccountsApi, routingApi
} from './bank';

// ============================================================
// INTEL
// ============================================================

export { intelApi } from './intel';

export { posApi } from './pos';
