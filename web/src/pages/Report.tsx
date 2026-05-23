import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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

  // Loading
  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            border: '3px solid #2a2a4a',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ color: '#94a3b8', fontSize: 15 }}>Loading report...</span>
      </div>
    );
  }

  // Error
  if (error || !report) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 48 }}>&#x1f50d;</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>Report Not Found</h2>
        <p style={{ color: '#94a3b8', fontSize: 15 }}>{error || 'This report does not exist.'}</p>
        <a
          href="/"
          style={{
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            background: '#6366f1',
            color: '#fff',
            borderRadius: 10,
            display: 'inline-block',
            marginTop: 8,
          }}
        >
          Go Home
        </a>
      </div>
    );
  }

  const { baseline, optimizations, totalImprovement, url } = report;

  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 900 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
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
              marginBottom: 6,
            }}
          >
            Performance Report
          </h1>
          <div style={{ fontSize: 14, color: '#64748b', wordBreak: 'break-all' }}>{url}</div>
        </div>

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
            flexShrink: 0,
          }}
        >
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>

      {/* Summary Card */}
      {totalImprovement && (
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
              marginBottom: 12,
            }}
          >
            {totalImprovement}
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8' }}>
            across {optimizations.length} optimization{optimizations.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

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
        </div>
      )}

      {/* Optimizations */}
      {optimizations.length > 0 && (
        <div className="fade-in" style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>
            Optimizations Applied
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {optimizations.map((opt) => (
              <OptimizationRow key={opt.id} optimization={opt} />
            ))}
          </div>
        </div>
      )}

      {/* Before/After */}
      {baseline?.screenshot && optimizations.some((o) => o.screenshot) && (
        <div className="fade-in" style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>
            Visual Comparison
          </h2>
          <BeforeAfter
            beforeScreenshot={baseline.screenshot}
            afterScreenshot={optimizations[optimizations.length - 1]?.screenshot}
          />
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          textAlign: 'center',
          padding: '24px 0',
          borderTop: '1px solid #1a1a2e',
          color: '#64748b',
          fontSize: 13,
        }}
      >
        Generated by{' '}
        <a href="/" style={{ color: '#6366f1', fontWeight: 600 }}>
          Remedy
        </a>{' '}
        &mdash; Built for Google I/O 2026
      </div>
    </div>
  );
}
