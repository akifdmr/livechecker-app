// src/components/FavoriteBadges.tsx  (.tsx, JSX VAR)
import type { FavList } from '../api';

interface Props {
  matches: FavList[];
  size?: 'sm' | 'md';
}

export default function FavoriteBadges({ matches, size = 'sm' }: Props) {
  if (!matches || matches.length === 0) return null;

  const sizeClass = size === 'sm' ? 'text-[9px] px-1 h-4' : 'text-[11px] px-1.5 h-5';
  const listNames = matches.map((favorite) => favorite.name).join(', ');

  return (
    <span
      className={`inline-flex items-center justify-center rounded font-bold text-white ${sizeClass}`}
      style={{ background: matches[0].color || '#4CAF50' }}
      title={`Favori listeler: ${listNames}`}
      aria-label={`Favori listeler: ${listNames}`}
    >
      ⭐
    </span>
  );
}
