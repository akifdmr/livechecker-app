import type { FavList } from '../api';

/**
 * Bir BIN'in hangi favori listelerine ait olduğunu döndürür
 */
export function matchFavoritesByBin(bin: string, favorites: FavList[]): FavList[] {
  if (!bin || !favorites) return [];
  return favorites.filter((f) =>
    (f.bins || []).some((b) => bin.startsWith(b))
  );
}

/**
 * Bir PAN'ın hangi favori listelerine ait olduğunu döndürür
 */
export function matchFavoritesByPan(pan: string, favorites: FavList[]): FavList[] {
  if (!pan || !favorites) return [];
  return favorites.filter((f) =>
    (f.bins || []).some((b) => pan.startsWith(b))
  );
}

/**
 * Favori liste rozetlerini render eder (küçük ikonlar)
 */
export function FavoriteBadges({
  matches,
  size = 'sm',
}: {
  matches: FavList[];
  size?: 'sm' | 'md';
}) {
  if (!matches || matches.length === 0) return null;

  const sizeClass = size === 'sm' ? 'text-[9px] px-1 h-4' : 'text-[11px] px-2 h-5';

  return (
    <>
      {matches.map((f) => (
        <span
          key={f.id}
          className={`inline-flex items-center justify-center rounded font-bold text-white ${sizeClass}`}
          style={{ background: f.color || '#4CAF50' }}
          title={f.name}
        >
          {size === 'sm' ? '⭐' : f.name}
        </span>
      ))}
    </>
  );
}