import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import type { BaselineResult, Suggestion, OptimizationResult } from '../types';
import AgentLog from '../components/AgentLog';
import MetricsCard, { getMetricRating } from '../components/MetricsCard';
import OptimizationRow from '../components/OptimizationRow';
import BeforeAfter from '../components/BeforeAfter';

export default function Analyze() {
  const { reportId } = useParams<{ reportId: string }>();

  const [status, setStatus] = useState('Connecting to agent...');
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<BaselineResult | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [selectedFixes, setSelectedFixes] = useState<Set<string>>(new Set());
  const [optimizations, setOptimizations] = useState<OptimizationResult[]>([]);
  const [totalImprovement, setTotalImprovement] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // SSE connection
  useEffect(() => {
    if (!reportId) return;

    const eventSource = new EventSource(`/api/stream/${reportId}`);

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);

        switch (event.type) {
          case 'status':
            setStatus(event.data);
            setStatusLog((prev) => [...prev, event.data]);
            break;

          case 'baseline':
            setBaseline(event.data);
            setStatusLog((prev) => [...prev, 'Baseline metrics collected']);
            break;

          case 'suggestions':
            setSuggestions(event.data);
            // Auto-select all suggestions
            setSelectedFixes(new Set(event.data.map((s: Suggestion) => s.id)));
            setStatusLog((prev) => [
              ...prev,
              `Found ${event.data.length} optimization suggestions`,
            ]);
            break;

          case 'optimization':
            setOptimizations((prev) => [...prev, event.data]);
            setStatusLog((prev) => [
              ...prev,
              `Tested: ${event.data.name} (${event.data.improvement})`,
            ]);
            break;

          case 'complete':
            setTotalImprovement(event.data?.totalImprovement ?? null);
            setIsComplete(true);
            setIsApplying(false);
            setStatusLog((prev) => [...prev, 'Analysis complete!']);
            eventSource.close();
            break;

          case 'error':
            setError(event.data || 'An unexpected error occurred');
            setStatusLog((prev) => [...prev, `Error: ${event.data}`]);
            eventSource.close();
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) return;
      setError('Connection to agent lost. Refresh to retry.');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [reportId]);

  // Toggle a fix selection
  const toggleFix = useCallback((id: string) => {
    setSelectedFixes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Apply selected fixes
  async function handleApplyFixes() {
    if (!reportId || selectedFixes.size === 0) return;
    setIsApplying(true);
    setOptimizations([]);
    setTotalImprovement(null);
    setIsComplete(false);

    try {
      const res = await fetch(`/api/apply/${reportId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixIds: [...selectedFixes] }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to apply fixes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply fixes');
      setIsApplying(false);
    }
  }

  // Share
  function handleShare() {
    const url = `${window.location.origin}/report/${reportId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const impactColors: Record<string, string> = {
    high: '#22c55e',
    medium: '#f59e0b',
    low: '#6366f1',
  };

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 900 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
        }}
      >
        <div>
          <a
            href="/"
            style={{
              fontSize: 13,
              color: '#64748b',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
            }}
          >
            &larr; Back
          </a>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #e2e8f0, #6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Analyzing...
          </h1>
        </div>

        {isComplete && (
          <button
            onClick={handleShare}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              background: '#6366f1',
              color: '#fff',
              borderRadius: 10,
              transition: 'background 0.2s',
            }}
          >
            {copied ? 'Copied!' : 'Share Report'}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="fade-in"
          style={{
            background: '#ef444415',
            border: '1px solid #ef444440',
            borderRadius: 12,
            padding: 16,
            color: '#ef4444',
            fontSize: 14,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {/* Agent Log */}
      <AgentLog messages={statusLog} />

      {/* Baseline Metrics */}
      {baseline && (
        <div className="fade-in" style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>
            Baseline Metrics
          </h2>

          <div style={{ display: 'flex', gap: 12 }}>
            <MetricsCard
              label="LCP"
              value={baseline.lcp}
              unit="ms"
              rating={getMetricRating('lcp', baseline.lcp)}
            />
            <MetricsCard
              label="CLS"
              value={baseline.cls}
              unit=""
              rating={getMetricRating('cls', baseline.cls)}
            />
            <MetricsCard
              label="INP"
              value={baseline.inp}
              unit="ms"
              rating={getMetricRating('inp', baseline.inp)}
            />
            <MetricsCard
              label="TTFB"
              value={baseline.ttfb}
              unit="ms"
              rating={getMetricRating('ttfb', baseline.ttfb)}
            />
          </div>

          {baseline.screenshot && (
            <div style={{ marginTop: 16 }}>
              <img
                src={
                  baseline.screenshot.startsWith('data:')
                    ? baseline.screenshot
                    : `data:image/png;base64,${baseline.screenshot}`
                }
                alt="Baseline screenshot"
                style={{
                  width: '100%',
                  maxWidth: 600,
                  borderRadius: 12,
                  border: '1px solid #2a2a4a',
                }}
              />
            </div>
          )}

          {baseline.report && (
            <div
              style={{
                marginTop: 20,
                background: '#111827',
                border: '1px solid #2a2a4a',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                Frontend & Performance Readout
              </h3>
              <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16 }}>
                {baseline.report.summary}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 16,
                }}
              >
                <ReportList title="Improve next" items={baseline.report.improveNext} color="#f59e0b" />
                <ReportList title="Good enough" items={baseline.report.goodEnough} color="#22c55e" />
                <ReportList
                  title="Performance notes"
                  items={baseline.report.performanceComparison}
                  color="#6366f1"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="fade-in" style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>
            Suggested Optimizations
          </h2>

          <div
            style={{
              background: '#1a1a2e',
              border: '1px solid #2a2a4a',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {suggestions.map((s, i) => (
              <label
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 20px',
                  borderBottom: i < suggestions.length - 1 ? '1px solid #2a2a4a' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1e1e38';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedFixes.has(s.id)}
                  onChange={() => toggleFix(s.id)}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: '#6366f1',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>
                      {s.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: impactColors[s.impact] || '#94a3b8',
                        background: `${impactColors[s.impact] || '#94a3b8'}15`,
                        padding: '2px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {s.impact} impact
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#22c55e',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                      }}
                    >
                      {s.expectedImprovement}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, lineHeight: 1.5 }}>
                    {s.explanation}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Apply button */}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleApplyFixes}
              disabled={selectedFixes.size === 0 || isApplying}
              style={{
                padding: '12px 28px',
                fontSize: 15,
                fontWeight: 700,
                background:
                  selectedFixes.size === 0
                    ? '#2a2a4a'
                    : 'linear-gradient(135deg, #6366f1, #818cf8)',
                color: selectedFixes.size === 0 ? '#64748b' : '#fff',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {isApplying && (
                <span
                  style={{
                    width: 16,
                    height: 16,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
              )}
              {isApplying
                ? 'Testing Fixes...'
                : `Test Selected Fixes (${selectedFixes.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Optimizations */}
      {optimizations.length > 0 && (
        <div className="fade-in" style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>
            Optimization Results
          </h2>

          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {optimizations.map((opt) => (
              <OptimizationRow key={opt.id} optimization={opt} />
            ))}
          </div>
        </div>
      )}

      {/* Loading indicator while applying */}
      {isApplying && optimizations.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 48,
            gap: 16,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid #2a2a4a',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ color: '#94a3b8', fontSize: 14 }}>{status}</span>
        </div>
      )}

      {/* Summary */}
      {isComplete && totalImprovement && (
        <div
          className="fade-in-up"
          style={{
            background: 'linear-gradient(135deg, #1a2e1a, #1a1a2e)',
            border: '1px solid #22c55e40',
            borderRadius: 16,
            padding: 32,
            textAlign: 'center',
            marginBottom: 32,
          }}
        >
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 8, fontWeight: 500 }}>
            Total Performance Improvement
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: '#22c55e',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1,
              marginBottom: 16,
            }}
          >
            {totalImprovement}
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
            across {optimizations.length} optimization{optimizations.length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={handleShare}
            style={{
              padding: '12px 32px',
              fontSize: 15,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              color: '#fff',
              borderRadius: 10,
            }}
          >
            {copied ? 'Link Copied!' : 'Share Report'}
          </button>
        </div>
      )}

      {/* Before/After screenshots from optimizations */}
      {optimizations.length > 0 &&
        optimizations.some((o) => o.screenshot) && (
          <div className="fade-in" style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>
              Visual Comparison
            </h2>
            <BeforeAfter
              beforeScreenshot={baseline?.screenshot}
              afterScreenshot={optimizations[optimizations.length - 1]?.screenshot}
            />
          </div>
        )}
    </div>
  );
}

function ReportList({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: '#94a3b8', fontSize: 13, lineHeight: 1.55 }}>
        {items.slice(0, 4).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
