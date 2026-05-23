import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, Share2, Loader2, Search, TrendingDown,
} from 'lucide-react';
import type { BaselineResult, OptimizationResult } from '../types';
import MetricsCard, { getMetricRating } from '../components/MetricsCard';
import OptimizationRow from '../components/OptimizationRow';
import BeforeAfter from '../components/BeforeAfter';

interface ReportData {
  baseline: BaselineResult;
  optimizations: OptimizationResult[];
  totalImprovement: string;
  url: string;
  createdAt: string;
}

export default function Report() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!reportId) return;

    fetch(`/api/report/${reportId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Report not found');
        }
        return res.json();
      })
      .then((data) => {
        setReport(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load report');
        setLoading(false);
      });
  }, [reportId]);

  function handleShare() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <main className="relative min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="pointer-events-none absolute inset-0 bg-hero" />
        <Loader2 className="size-12 text-[color:var(--color-cyan)] animate-spin relative z-10" />
        <span className="text-muted-foreground text-[15px] relative z-10">Loading report...</span>
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="relative min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <div className="pointer-events-none absolute inset-0 bg-hero" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Search className="size-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Report Not Found</h2>
          <p className="text-muted-foreground text-[15px]">{error || 'This report does not exist.'}</p>
          <a
            href="/"
            className="mt-2 inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-semibold text-[color:var(--primary-foreground)]"
            style={{ background: 'var(--gradient-cyan)' }}
          >
            Go Home
          </a>
        </div>
      </main>
    );
  }

  const { baseline, optimizations, totalImprovement, url } = report;

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

          <div className="flex items-center gap-2">
            <a
              href={`/api/report/${reportId}/html`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium rounded-md px-4 py-2 text-foreground border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            >
              Full HTML Report
            </a>
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-2 text-sm font-medium rounded-md px-4 py-2 text-[color:var(--primary-foreground)] transition-transform active:scale-[0.98]"
              style={{ background: 'var(--gradient-cyan)' }}
            >
              <Share2 className="size-4" />
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
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
          <h1 className="text-3xl font-semibold tracking-tight text-gradient mb-1.5">
            Performance Report
          </h1>
          <div className="text-sm text-muted-foreground font-mono break-all">{url}</div>
        </div>

        {/* Summary Card */}
        {totalImprovement && (
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
              <div className="text-sm text-muted-foreground">
                across {optimizations.length} optimization{optimizations.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}

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
          </div>
        )}

        {/* Optimizations */}
        {optimizations.length > 0 && (
          <div className="fade-up mb-8">
            <h2 className="text-lg font-semibold mb-4 text-foreground">
              Optimizations Applied
            </h2>
            <div className="flex flex-col gap-3">
              {optimizations.map((opt) => (
                <OptimizationRow key={opt.id} optimization={opt} />
              ))}
            </div>
          </div>
        )}

        {/* Before/After */}
        {baseline?.screenshot && optimizations.some((o) => o.screenshot) && (
          <div className="fade-up mb-8">
            <h2 className="text-lg font-semibold mb-4 text-foreground">
              Visual Comparison
            </h2>
            <BeforeAfter
              beforeScreenshot={baseline.screenshot}
              afterScreenshot={optimizations[optimizations.length - 1]?.screenshot}
            />
          </div>
        )}

        {/* Footer */}
        <footer className="border-t border-white/5 pt-6 text-center text-sm text-muted-foreground">
          Generated by{' '}
          <a href="/" className="text-[color:var(--color-cyan)] font-semibold hover:text-foreground transition-colors">
            Remedy
          </a>
        </footer>
      </div>
    </main>
  );
}
