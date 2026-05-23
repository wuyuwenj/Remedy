import { useState } from 'react';
import type { OptimizationResult } from '../types';
import BeforeAfter from './BeforeAfter';
import { ChevronRight } from 'lucide-react';

function metricDelta(before: number | undefined, after: number | undefined): string | null {
  if (before == null || after == null || before === 0) return null;
  const pct = ((before - after) / before) * 100;
  return pct > 0 ? `-${pct.toFixed(1)}%` : `+${Math.abs(pct).toFixed(1)}%`;
}

export default function OptimizationRow({ optimization }: { optimization: OptimizationResult }) {
  const [expanded, setExpanded] = useState(false);
  const { name, improvement, before, after, explanation, initScript, postLoadScript, screenshot } =
    optimization;

  const metrics = (['lcp', 'cls', 'inp', 'ttfb'] as const).filter(
    (m) => before[m] != null && after[m] != null
  );

  return (
    <div className="panel overflow-hidden fade-up">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 bg-transparent text-foreground text-[15px] font-semibold gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3 flex-1">
          <ChevronRight
            className={`size-4 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <span>{name}</span>
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
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-white/5">
          {/* Before/After metrics table */}
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

          {/* Explanation */}
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Explanation
            </div>
            <div className="text-sm text-foreground/80 leading-relaxed">
              {explanation}
            </div>
          </div>

          {/* Code snippets */}
          {initScript && (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Init Script
              </div>
              <pre className="bg-black/30 border border-white/5 rounded-lg p-3 text-xs font-mono text-[color:var(--color-cyan)] overflow-x-auto whitespace-pre-wrap break-words">
                {initScript}
              </pre>
            </div>
          )}

          {postLoadScript && (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Post-Load Script
              </div>
              <pre className="bg-black/30 border border-white/5 rounded-lg p-3 text-xs font-mono text-[color:var(--color-cyan)] overflow-x-auto whitespace-pre-wrap break-words">
                {postLoadScript}
              </pre>
            </div>
          )}

          {/* Screenshots */}
          <BeforeAfter
            beforeScreenshot={before.lcp != null ? undefined : undefined}
            afterScreenshot={screenshot}
          />
        </div>
      )}
    </div>
  );
}
