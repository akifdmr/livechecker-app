import { api } from './client';

export interface ProcessorDumpRecord {
  id?: number;
  batchId?: string;
  sourceLine?: number;
  status?: string | null;
  ashStatus?: string | null;
  statusDescription?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  transactionType?: string | null;
  mti?: string | null;
  creditTerms?: string | null;
  brand?: string | null;
  cardType?: string | null;
  f39Response?: string | null;
  panEntryMode?: string | null;
  importedAt?: string;
}

export const processorDumpsApi = {
  import: async (records: ProcessorDumpRecord[]) => {
    const { data } = await api.post('/processor-dump-imports', { records });
    return data as { imported: number; batchId: string };
  },
  list: async () => {
    const { data } = await api.get('/processor-dump-imports', { params: { limit: 100 } });
    return data as { records: ProcessorDumpRecord[]; total: number };
  },
};
