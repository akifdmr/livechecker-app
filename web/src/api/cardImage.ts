// ============================================================
// src/api/cardImage.ts
// ============================================================
import { api } from './client';

export type GeneratedCardImage = {
  success: boolean;
  id: number;
  bin: string;
  cardholder_name: string;
  pan_masked?: string;
  meta: {
    bin: string;
    brand: string;
    type: string;
    category: string;
    level: string;
    issuer: string;
    country: string;
    isoCode2: string;
    isoCode3: string;
  };
  images: { front: string; back: string };
  prompts?: { front: string; back: string };
  created_at?: string;
};

export type ArchivedImage = {
  id: number;
  user_id: number;
  username?: string;
  email?: string;
  live_card_id: number | null;
  bin: string;
  cardholder_name: string;
  pan_masked: string | null;
  brand: string | null;
  category: string | null;
  level: string;
  issuer: string | null;
  images: { front: string; back: string };
  meta: any;
  created_at: string;
};

export const cardImageApi = {
  generateFromCard: async (cardId: number, cardholderName?: string): Promise<GeneratedCardImage> => {
    const { data } = await api.post(`/card-image/card/${cardId}`, {
      cardholder_name: cardholderName,
    });
    return data;
  },

  generateFromPan: async (input: {
    pan: string; expiry: string; cvv: string; cardholder_name: string;
  }): Promise<GeneratedCardImage> => {
    const { data } = await api.post('/card-image', input);
    return data;
  },

  archive: async (params: Record<string, any> = {}): Promise<{ images: ArchivedImage[]; count: number }> => {
    const { data } = await api.get('/card-image/archive', { params });
    return data;
  },

  remove: async (id: number) => {
    const { data } = await api.delete(`/card-image/archive/${id}`);
    return data;
  },
};