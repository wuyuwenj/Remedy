import { useState } from 'react';
import type { OptimizationResult } from '../types';
import BeforeAfter from './BeforeAfter';

interface OptimizationRowProps {
  optimization: OptimizationResult;
}

const impactColor: Record<string, string> = {
  high: '#22c55e',
  medium: '#f59e0b',
  low: '#6366f1',
};

function metricDelta(before: number | undefined, after: number | undefined): string | null {
  if (before == null || after == null || before === 0) return null;
  const pct = ((before - after) / before) * 100;
  return pct > 0 ? `-${pct.toFixed(1)}%` : `+${Math.abs(pct).toFixed(1)}%`;
}

export default function OptimizationRow({ optimization }: OptimizationRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { name, improvement, before, after, explanation, initScript, postLoadScript, screenshot } =
    optimization;

  const metrics = (['lcp', 'cls', 'inp', 'ttfb'] as const).filter(
    (m) => before[m] != null && after[m] != null
  );

  return (
    <div
      style={{
        background: '#1a1a2e',
        border: '1px solid #2a2a4a',
        borderRadius: 12,
        overflow: 'hidden',
        animation: 'fadeIn 0.4s ease-out both',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'transparent',
          color: '#e2e8f0',
          fontSize: 15,
          fontWeight: 600,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <span
            style={{
              fontSize: 18,
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
              display: 'inline-block',
            }}
          >
            &#9654;
          </span>
          <span>{name}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Metric deltas */}
          {metrics.map((m) => {
            const delta = metricDelta(before[m], after[m]);
            if (!delta) return null;
            const isImprovement = delta.startsWith('-');
            return (
              <span
                key={m}
                style={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: isImprovement ? '#22c55e' : '#ef4444',
                  background: isImprovement ? '#22c55e15' : '#ef444415',
                  padding: '2px 8px',
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                {m.toUpperCase()} {delta}
              </span>
            );
          })}

          {/* Overall improvement */}
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#22c55e',
              background: '#22c55e15',
              padding: '4px 12px',
              borderRadius: 20,
            }}
          >
            {improvement}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: '0 20px 20px',
            borderTop: '1px solid #2a2a4a',
            animation: 'slideDown 0.3s ease-out',
          }}
        >
          {/* Before/After metrics table */}
          {metrics.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `100px repeat(${metrics.length}, 1fr)`,
                gap: 0,
                margin: '16px 0',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <div style={{ color: '#64748b', padding: '8px 0' }} />
              {metrics.map((m) => (
                <div
                  key={m}
                  style={{
                    color: '#94a3b8',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid #2a2a4a',
                  }}
                >
                  {m}
                </div>
              ))}

              {/* Before row */}
              <div style={{ color: '#94a3b8', padding: '8px 0' }}>Before</div>
              {metrics.map((m) => (
                <div
                  key={`b-${m}`}
                  style={{ textAlign: 'center', padding: '8px 0', color: '#ef4444' }}
                >
                  {before[m]?.toFixed(m === 'cls' ? 3 : 0)}
                </div>
              ))}

              {/* After row */}
              <div style={{ color: '#94a3b8', padding: '8px 0' }}>After</div>
              {metrics.map((m) => (
                <div
                  key={`a-${m}`}
                  style={{ textAlign: 'center', padding: '8px 0', color: '#22c55e' }}
                >
                  {after[m]?.toFixed(m === 'cls' ? 3 : 0)}
                </div>
              ))}
            </div>
          )}

          {/* Explanation */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: '#94a3b8',
                letterSpacing: '0.05em',
                marginBottom: 6,
              }}
            >
              Explanation
            </div>
            <div style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6 }}>
              {explanation}
            </div>
          </div>

          {/* Code snippets */}
          {initScript && (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                  letterSpacing: '0.05em',
                  marginBottom: 6,
                }}
              >
                Init Script
              </div>
              <pre
                style={{
                  background: '#0f0f1a',
                  border: '1px solid #1e1e3a',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#a5b4fc',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {initScript}
              </pre>
            </div>
          )}

          {postLoadScript && (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: '#94a3b8',
                  letterSpacing: '0.05em',
                  marginBottom: 6,
                }}
              >
                Post-Load Script
              </div>
              <pre
                style={{
                  background: '#0f0f1a',
                  border: '1px solid #1e1e3a',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#a5b4fc',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
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
