interface StatBadgeProps {
  label: string;
  value: string | number;
  valueClass?: string;
}

export default function StatBadge({
  label,
  value,
  valueClass = 'text-gray-200',
}: StatBadgeProps) {
  return (
    <div className="bg-bg-card border border-border rounded px-2 py-1.5">
      <div className="text-[9px] text-gray-500 uppercase tracking-wide">
        {label}
      </div>
      <div className={`font-bold text-xs mt-0.5 ${valueClass}`}>{value}</div>
    </div>
  );
}