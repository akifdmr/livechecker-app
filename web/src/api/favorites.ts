// api/favorites.ts
import { api } from './client';

export interface FavList {
  id: number;
  name: string;
  bins: string[];
  color: string;
  cardCount?: number;
}

export const favoritesApi = {
  list: async (): Promise<FavList[]> => {
    const { data } = await api.get('/bin-favorites');
    return data.favorites || [];
  },

  create: async (payload: { name: string; bins: string[]; color: string }) => {
    const { data } = await api.post('/bin-favorites', payload);
    return data.favorite;
  },

  delete: async (id: number) => {
    await api.delete(`/bin-favorites/${id}`);
  },

  matchingCards: async (id: number) => {
    const { data } = await api.get(`/bin-favorites/${id}/cards`);
    return data;
  },
};