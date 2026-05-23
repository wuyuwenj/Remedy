type Rating = 'good' | 'needs-improvement' | 'poor';

interface MetricsCardProps {
  label: string;
  value: number;
  unit: string;
  rating: Rating;
}

const ratingStyles: Record<Rating, { color: string; label: string }> = {
  good: { color: 'var(--color-improve)', label: 'Good' },
  'needs-improvement': { color: 'var(--color-warn)', label: 'Needs Work' },
  poor: { color: 'var(--color-bad)', label: 'Poor' },
};

export function getMetricRating(metric: string, value: number): Rating {
  const key = metric.toLowerCase();
  if (key === 'lcp') {
    if (value < 2500) return 'good';
    if (value > 4000) return 'poor';
    return 'needs-improvement';
  }
  if (key === 'cls') {
    if (value < 0.1) return 'good';
    if (value > 0.25) return 'poor';
    return 'needs-improvement';
  }
  if (key === 'inp') {
    if (value < 200) return 'good';
    if (value > 500) return 'poor';
    return 'needs-improvement';
  }
  if (key === 'ttfb') {
    if (value < 800) return 'good';
    if (value > 1800) return 'poor';
    return 'needs-improvement';
  }
  return 'needs-improvement';
}

function formatValue(value: number, unit: string): string {
  if (unit === '') return value.toFixed(3);
  if (value >= 1000 && unit === 'ms') return (value / 1000).toFixed(2) + 's';
  return Math.round(value) + unit;
}

export default function MetricsCard({ label, value, unit, rating }: MetricsCardProps) {
  const { color, label: ratingLabel } = ratingStyles[rating];

  return (
    <div
      className="panel relative overflow-hidden flex-1 min-w-[140px] text-center px-4 py-5 fade-up"
      style={{ borderColor: `color-mix(in oklch, ${color}, transparent 80%)` }}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-3/5 h-0.5"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />

      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        {label}
      </div>

      <div
        className="text-[32px] font-bold font-mono leading-none mb-2"
        style={{ color }}
      >
        {formatValue(value, unit)}
      </div>

      <div
        className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
        style={{ color, background: `color-mix(in oklch, ${color}, transparent 88%)` }}
      >
        {ratingLabel}
      </div>
    </div>
  );
}
