type Rating = 'good' | 'needs-improvement' | 'poor';

interface MetricsCardProps {
  label: string;
  value: number;
  unit: string;
  rating: Rating;
}

const ratingColors: Record<Rating, string> = {
  good: '#22c55e',
  'needs-improvement': '#f59e0b',
  poor: '#ef4444',
};

const ratingLabels: Record<Rating, string> = {
  good: 'Good',
  'needs-improvement': 'Needs Work',
  poor: 'Poor',
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
  const color = ratingColors[rating];

  return (
    <div
      style={{
        background: '#1a1a2e',
        border: `1px solid ${color}33`,
        borderRadius: 12,
        padding: '20px 16px',
        flex: '1 1 0',
        minWidth: 140,
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        animation: 'fadeIn 0.5s ease-out both',
      }}
    >
      {/* Glow top accent */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60%',
          height: 2,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />

      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#94a3b8',
          marginBottom: 8,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1,
          marginBottom: 8,
        }}
      >
        {formatValue(value, unit)}
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color,
          background: `${color}15`,
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: 20,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {ratingLabels[rating]}
      </div>
    </div>
  );
}
