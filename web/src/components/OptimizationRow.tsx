import type { OptimizationResult } from '../types';
import BeforeAfter from './BeforeAfter';

function metricDelta(before: number | undefined, after: number | undefined): string | null {
  if (before == null || after == null || before === 0) return null;
  const pct = ((before - after) / before) * 100;
  return pct > 0 ? `-${pct.toFixed(1)}%` : `+${Math.abs(pct).toFixed(1)}%`;
}

export default function OptimizationRow({ optimization }: { optimization: OptimizationResult }) {
  const { name, improvement, before, after, explanation, beforeScreenshot, screenshot } = optimization;

  const metrics = (['lcp', 'cls', 'inp', 'ttfb'] as const).filter(
    (m) => before[m] != null && after[m] != null
  );

  return (
    <div className="panel overflow-hidden fade-up p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground leading-snug">{name}</h3>
          {explanation && (
            <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{explanation}</p>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          {metrics.map((m) => {
            const delta = metricDelta(before[m], after[m]);
            if (!delta) return null;
            const isImprovement = delta.startsWith('-');
            return (
              <span
                key={m}
                className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md ${
                  isImprovement
                    ? 'text-[color:var(--color-improve)] bg-[color:var(--color-improve)]/10'
                    : 'text-[color:var(--color-bad)] bg-[color:var(--color-bad)]/10'
                }`}
              >
                {m.toUpperCase()} {delta}
              </span>
            );
          })}

          <span className="text-[13px] font-bold font-mono text-[color:var(--color-improve)] bg-[color:var(--color-improve)]/10 px-3 py-1 rounded-full">
            {improvement}
          </span>
        </div>
      </div>

      {metrics.length > 0 && (
        <div
          className="grid my-4 text-[13px] font-mono"
          style={{ gridTemplateColumns: `100px repeat(${metrics.length}, 1fr)` }}
        >
          <div className="text-muted-foreground py-2" />
          {metrics.map((m) => (
            <div
              key={m}
              className="text-muted-foreground font-semibold uppercase text-center py-2 border-b border-white/5"
            >
              {m}
            </div>
          ))}

          <div className="text-muted-foreground py-2">Before</div>
          {metrics.map((m) => (
            <div key={`b-${m}`} className="text-center py-2 text-[color:var(--color-bad)]">
              {before[m]?.toFixed(m === 'cls' ? 3 : 0)}
            </div>
          ))}

          <div className="text-muted-foreground py-2">After</div>
          {metrics.map((m) => (
            <div key={`a-${m}`} className="text-center py-2 text-[color:var(--color-improve)]">
              {after[m]?.toFixed(m === 'cls' ? 3 : 0)}
            </div>
          ))}
        </div>
      )}

      <BeforeAfter
        beforeScreenshot={beforeScreenshot}
        afterScreenshot={screenshot}
      />
    </div>
  );
}
