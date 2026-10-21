// ============================================================
// STAT CARD — İstatistik Kartı
// ============================================================
interface StatCardProps {
  label: string;
  value: number | string;
  variant?: 'default' | 'live' | 'dead' | 'warn';
  icon?: string;
}

export default function StatCard({
  label,
  value,
  variant = 'default',
  icon,
}: StatCardProps) {
  const colors = {
    default: 'text-accent',
    live: 'text-live',
    dead: 'text-dead',
    warn: 'text-warn',
  };

  return (
    <div className="bg-bg-card border border-border rounded-lg p-4 text-center">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">
        {icon && <span className="mr-1">{icon}</span>}
        {label}
      </div>
      <div className={`text-2xl font-bold ${colors[variant]}`}>{value}</div>
    </div>
  );
}