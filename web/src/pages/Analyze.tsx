import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, Share2, CheckCircle2, Loader2, AlertCircle, TrendingDown,
} from 'lucide-react';
import type { BaselineResult, Suggestion, OptimizationResult } from '../types';
import AgentLog from '../components/AgentLog';
import MetricsCard, { getMetricRating } from '../components/MetricsCard';
import OptimizationRow from '../components/OptimizationRow';
import BeforeAfter from '../components/BeforeAfter';

const impactStyles: Record<string, string> = {
  high: 'text-[color:var(--color-improve)] bg-[color:var(--color-improve)]/10',
  medium: 'text-[color:var(--color-warn)] bg-[color:var(--color-warn)]/10',
  low: 'text-[color:var(--color-cyan)] bg-[color:var(--color-cyan)]/10',
};

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
  const [baselineDone, setBaselineDone] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

          case 'done':
            // Baseline phase finished: metrics + suggestions are ready and we're
            // now waiting for the user to select fixes. Stops the "Analyzing..."
            // indicator (the optimize phase emits 'complete' later).
            setBaselineDone(true);
            setStatusLog((prev) => [...prev, 'Baseline complete — select fixes to test']);
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

    return () => { eventSource.close(); };
  }, [reportId]);

  const toggleFix = useCallback((id: string) => {
    setSelectedFixes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  function handleShare() {
    const url = `${window.location.origin}/report/${reportId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-hero" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />

      {/* Nav */}
      <header className="relative z-20">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span
              className="grid place-items-center size-7 rounded-md"
              style={{ background: 'var(--gradient-cyan)' }}
            >
              <Activity className="size-4 text-[color:var(--primary-foreground)]" />
            </span>
            <span className="font-semibold tracking-tight">Remedy</span>
          </a>

          {isComplete && (
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-2 text-sm font-medium rounded-md px-4 py-2 text-[color:var(--primary-foreground)] transition-transform active:scale-[0.98]"
              style={{ background: 'var(--gradient-cyan)' }}
            >
              <Share2 className="size-4" />
              {copied ? 'Copied!' : 'Share Report'}
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[900px] px-6 pt-4 pb-16">
        {/* Back + Title */}
        <div className="mb-8">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </a>
          <h1 className="text-3xl font-semibold tracking-tight text-gradient">
            {isComplete || baselineDone ? 'Analysis Ready' : 'Analyzing...'}
          </h1>
        </div>

        {/* Error */}
        {error && (
          <div className="fade-up panel mb-6 p-4 flex items-start gap-3 border-[color:var(--color-bad)]/30">
            <AlertCircle className="size-5 text-[color:var(--color-bad)] shrink-0 mt-0.5" />
            <span className="text-sm text-[color:var(--color-bad)]">{error}</span>
          </div>
        )}

        {/* Agent Log */}
        <AgentLog messages={statusLog} />

        {/* Baseline Metrics */}
        {baseline && (
          <div className="fade-up mb-8">
            <h2 className="text-lg font-semibold mb-4 text-foreground">
              Baseline Metrics
            </h2>

            <div className="flex gap-3">
              <MetricsCard label="LCP" value={baseline.lcp} unit="ms" rating={getMetricRating('lcp', baseline.lcp)} />
              <MetricsCard label="CLS" value={baseline.cls} unit="" rating={getMetricRating('cls', baseline.cls)} />
              <MetricsCard label="INP" value={baseline.inp} unit="ms" rating={getMetricRating('inp', baseline.inp)} />
              <MetricsCard label="TTFB" value={baseline.ttfb} unit="ms" rating={getMetricRating('ttfb', baseline.ttfb)} />
            </div>

            {baseline.screenshot && (
              <div className="mt-4">
                <img
                  src={
                    baseline.screenshot.startsWith('data:')
                      ? baseline.screenshot
                      : `data:image/png;base64,${baseline.screenshot}`
                  }
                  alt="Baseline screenshot"
                  className="w-full max-w-[600px] rounded-xl border border-white/10"
                />
              </div>
            )}

            {/* Frontend & Performance Readout */}
            {baseline.report && (
              <div className="panel mt-5 p-5">
                <h3 className="text-base font-semibold text-foreground mb-2">
                  Frontend & Performance Readout
                </h3>
                <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                  {baseline.report.summary}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ReportList title="Improve next" items={baseline.report.improveNext} color="var(--color-warn)" />
                  <ReportList title="Good enough" items={baseline.report.goodEnough} color="var(--color-improve)" />
                  <ReportList title="Performance notes" items={baseline.report.performanceComparison} color="var(--color-cyan)" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Suggestions */}
        {suggestions && suggestions.length > 0 && (
          <div className="fade-up mb-8">
            <h2 className="text-lg font-semibold mb-4 text-foreground">
              Suggested Optimizations
            </h2>

            <div className="panel overflow-hidden">
              {suggestions.map((s, i) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3.5 px-5 py-3.5 cursor-pointer hover:bg-white/[0.03] transition-colors ${
                    i < suggestions.length - 1 ? 'border-b border-white/5' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedFixes.has(s.id)}
                    onChange={() => toggleFix(s.id)}
                    className="size-4.5 accent-[color:var(--color-cyan)] cursor-pointer shrink-0"
                  />

                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[15px] font-semibold text-foreground">
                        {s.name}
                      </span>
                      <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${impactStyles[s.impact] || 'text-muted-foreground'}`}>
                        {s.impact} impact
                      </span>
                      <span className="text-xs font-mono font-semibold text-[color:var(--color-improve)]">
                        {s.expectedImprovement}
                      </span>
                    </div>
                    <div className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                      {s.explanation}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleApplyFixes}
                disabled={selectedFixes.size === 0 || isApplying}
                className="group inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: selectedFixes.size === 0 ? 'var(--muted)' : 'var(--gradient-cyan)' }}
              >
                {isApplying && (
                  <Loader2 className="size-4 animate-spin" />
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
          <div className="fade-up mb-8">
            <h2 className="text-lg font-semibold mb-4 text-foreground">
              Optimization Results
            </h2>
            <div className="flex flex-col gap-3">
              {optimizations.map((opt) => (
                <OptimizationRow key={opt.id} optimization={opt} />
              ))}
            </div>
          </div>
        )}

        {/* Loading indicator while applying */}
        {isApplying && optimizations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="size-10 text-[color:var(--color-cyan)] animate-spin" />
            <span className="text-sm text-muted-foreground">{status}</span>
          </div>
        )}

        {/* Summary */}
        {isComplete && totalImprovement && (
          <div className="fade-up panel mb-8 p-8 text-center relative overflow-hidden">
            <div
              className="absolute -inset-px rounded-[inherit] pointer-events-none"
              style={{
                background: 'radial-gradient(400px 150px at 50% 0%, oklch(0.78 0.18 155 / 0.2), transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                <TrendingDown className="size-4 text-[color:var(--color-improve)]" />
                Total Performance Improvement
              </div>
              <div className="text-5xl font-extrabold font-mono text-[color:var(--color-improve)] leading-none mb-4">
                {totalImprovement}
              </div>
              <div className="text-sm text-muted-foreground mb-6">
                across {optimizations.length} optimization{optimizations.length !== 1 ? 's' : ''}
              </div>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-[10px] px-6 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)] transition-transform active:scale-[0.98]"
                style={{ background: 'var(--gradient-cyan)' }}
              >
                <Share2 className="size-4" />
                {copied ? 'Link Copied!' : 'Share Report'}
              </button>
            </div>
          </div>
        )}

        {/* Before/After screenshots */}
        {optimizations.length > 0 &&
          optimizations.some((o) => o.screenshot) && (
            <div className="fade-up mb-8">
              <h2 className="text-lg font-semibold mb-4 text-foreground">
                Visual Comparison
              </h2>
              <BeforeAfter
                beforeScreenshot={baseline?.screenshot}
                afterScreenshot={optimizations[optimizations.length - 1]?.screenshot}
              />
            </div>
          )}
      </div>
    </main>
  );
}

function ReportList({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      <div
        className="text-xs font-bold uppercase tracking-wider mb-2"
        style={{ color }}
      >
        {title}
      </div>
      <ul className="list-disc pl-4 text-muted-foreground text-[13px] leading-relaxed space-y-1">
        {items.slice(0, 4).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
