import type { AnalysisSession, BaselineResult, OptimizationResult, Suggestion } from '../types.js';

type MetricKey = 'lcp' | 'cls' | 'inp' | 'ttfb';

const METRICS: Array<{ key: MetricKey; label: string; unit: string }> = [
  { key: 'lcp', label: 'LCP', unit: 'ms' },
  { key: 'cls', label: 'CLS', unit: '' },
  { key: 'inp', label: 'INP', unit: 'ms' },
  { key: 'ttfb', label: 'TTFB', unit: 'ms' },
];

export function renderReportHtml(session: AnalysisSession): string {
  const baseline = session.baseline;
  const optimizations = session.optimizations ?? [];
  const suggestions = session.suggestions ?? [];
  const report = baseline?.report;
  const bestOptimization = pickBestOptimization(optimizations);
  const comparisonOptimization = bestOptimization ?? optimizations.at(-1);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Remedy Report - ${escapeHtml(readableUrl(session.url))}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg-base: #09090b;
      --bg-surface: #121214;
      --bg-surface-hover: #18181b;
      --bg-terminal: #000000;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.15);
      --text-main: #fafafa;
      --text-muted: #a1a1aa;
      --text-dark: #71717a;
      --accent-cyan: #38bdf8;
      --accent-cyan-glow: rgba(56, 189, 248, 0.15);
      --accent-green: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --accent-purple: #c084fc;
      --font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'ui-monospace', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 48px; }
    header {
      display: grid;
      gap: 12px;
      margin-bottom: 20px;
      padding: 18px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
    }
    h1 { margin: 0; font-size: clamp(26px, 3vw, 38px); line-height: 1.08; font-weight: 650; letter-spacing: 0; }
    h2 {
      margin: 0 0 12px;
      color: var(--text-main);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h3 { margin: 0 0 8px; color: var(--text-main); font-size: 13px; font-weight: 600; letter-spacing: 0; }
    p { margin: 0; color: var(--text-muted); line-height: 1.55; }
    a { color: var(--accent-cyan); }
    strong { color: var(--text-main); font-weight: 600; }
    .url {
      width: fit-content;
      max-width: 100%;
      color: var(--text-muted);
      overflow-wrap: anywhere;
      font-family: var(--font-mono);
      font-size: 11.5px;
      background: var(--bg-terminal);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 6px 8px;
    }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      display: inline-flex;
      min-height: 22px;
      align-items: center;
      padding: 2px 6px;
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      background: var(--bg-surface);
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
      text-transform: uppercase;
    }
    .good, .done, .completed, .improved { color: var(--accent-green); background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); }
    .warn, .warning { color: var(--accent-amber); background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3); }
    .medium, .running { color: var(--accent-cyan); background: var(--accent-cyan-glow); border-color: rgba(56, 189, 248, 0.3); }
    .poor, .error, .regressed { color: var(--accent-red); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); }
    .high { color: var(--accent-purple); background: rgba(192, 132, 252, 0.1); border-color: rgba(192, 132, 252, 0.2); }
    .low, .unchanged { color: var(--text-muted); background: var(--bg-surface); border-color: var(--border-subtle); }
    section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
    }
    .panel {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 16px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
    }
    .panel:hover { border-color: var(--border-strong); }
    .grid { display: grid; gap: 8px; }
    .metric-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric-grid > .panel { padding: 12px; }
    .card-label { color: var(--text-muted); font-size: 11px; font-weight: 500; letter-spacing: 0; }
    .metric-value {
      margin: 6px 0 8px;
      color: var(--text-main);
      font-family: var(--font-mono);
      font-size: 24px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0;
    }
    .muted { color: var(--text-muted); }
    .screens { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    figure { margin: 0; }
    figcaption { margin-bottom: 8px; color: var(--text-muted); font-size: 11px; font-weight: 500; }
    img { display: block; width: 100%; height: auto; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-terminal); }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      background: var(--bg-terminal);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    th, td { padding: 8px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); text-align: left; vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    th { color: var(--text-dark); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    td { color: var(--text-muted); }
    td strong { color: var(--text-main); font-weight: 500; }
    .delta {
      display: inline-flex;
      margin-top: 4px;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .list { display: grid; gap: 8px; }
    .item {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 12px;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .item:hover { background: var(--bg-surface-hover); border-color: var(--border-strong); }
    .item-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    ul { margin: 8px 0 0; padding-left: 18px; color: var(--text-muted); }
    li { margin: 4px 0; line-height: 1.45; }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: var(--bg-terminal);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 10px;
      max-height: 260px;
      overflow: auto;
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 1.45;
    }
    details { border-top: 1px solid var(--border-subtle); padding: 12px 0; }
    details:first-child { border-top: 0; }
    summary { cursor: pointer; color: var(--text-main); font-size: 13px; font-weight: 500; }
    details[open] summary { margin-bottom: 10px; color: var(--accent-cyan); }
    @media (max-width: 900px) {
      main { padding: 16px 12px 40px; }
      .metric-grid, .screens { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="meta">
        ${pill(session.status)}
        ${pill(new Date().toLocaleString())}
        ${pill(`${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}`)}
        ${pill(`${optimizations.length} tested fix${optimizations.length === 1 ? '' : 'es'}`)}
      </div>
      <h1>Remedy Full Report</h1>
      <p class="url">${escapeHtml(session.url)}</p>
      <p>${escapeHtml(report?.summary ?? session.error ?? 'Analysis is available from the saved Remedy session.')}</p>
    </header>

    <section>
      <h2>Core Web Vitals</h2>
      <div class="grid metric-grid">
        ${baseline ? METRICS.map((metric) => renderMetricCard(baseline, metric.key, metric.label, metric.unit)).join('') : '<div class="panel muted">No baseline metrics recorded.</div>'}
      </div>
    </section>

    <section class="panel">
      <h2>Visual Comparison</h2>
      <div class="screens">
        ${renderScreenshot(comparisonOptimization ? `Original control for: ${comparisonOptimization.name}` : 'Original', comparisonOptimization?.beforeScreenshot ?? baseline?.screenshot)}
        ${renderScreenshot(comparisonOptimization ? `Applied fix: ${comparisonOptimization.name}` : 'Latest tested fix', comparisonOptimization?.screenshot ?? optimizations.at(-1)?.screenshot)}
      </div>
    </section>

    <section class="panel">
      <h2>Metric Comparison</h2>
      ${renderOptimizationTable(optimizations)}
    </section>

    <section class="panel">
      <h2>Analysis</h2>
      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        ${renderReportList('Improve Next', report?.improveNext)}
        ${renderReportList('Good Enough', report?.goodEnough)}
        ${renderReportList('Performance Notes', report?.performanceComparison)}
        ${renderReportList('Frontend Notes', report?.frontendComparison)}
      </div>
    </section>

    <section class="panel">
      <h2>Detected Issues And Suggested Fixes</h2>
      <div class="list">
        ${suggestions.length > 0 ? suggestions.map((suggestion) => renderSuggestion(suggestion, optimizations.find((opt) => opt.id === suggestion.id))).join('') : '<p class="muted">No suggestions recorded.</p>'}
      </div>
    </section>

    <section class="panel">
      <h2>Evidence Appendix</h2>
      <details>
        <summary>Trace Summary</summary>
        <pre>${escapeHtml(truncateText(String(baseline?.traceData ?? 'No trace data recorded.'), 8000))}</pre>
      </details>
      <details>
        <summary>Network Requests</summary>
        <pre>${escapeHtml(truncateText(String(baseline?.networkData ?? 'No network data recorded.'), 8000))}</pre>
      </details>
      ${report?.missingEvidence?.length ? `<details><summary>Missing Evidence</summary>${renderList(report.missingEvidence)}</details>` : ''}
    </section>
  </main>
</body>
</html>`;
}

function renderMetricCard(baseline: BaselineResult, key: MetricKey, label: string, unit: string): string {
  const value = baseline[key];
  const rating = getMetricRating(key, value);
  return `<div class="panel">
    <div class="card-label">${label}</div>
    <div class="metric-value">${formatMetric(key, value)}<span class="muted" style="font-size:16px">${unit}</span></div>
    ${pill(ratingLabel(rating), rating)}
  </div>`;
}

function renderOptimizationTable(optimizations: OptimizationResult[]): string {
  if (optimizations.length === 0) {
    return '<p class="muted">Optimization comparison will appear after selected fixes are tested.</p>';
  }

  return `<table>
    <thead><tr><th>Fix</th>${METRICS.map((metric) => `<th>${metric.label}</th>`).join('')}<th>Verdict</th></tr></thead>
    <tbody>
      ${optimizations.map((opt) => `<tr>
        <td><strong>${escapeHtml(opt.name)}</strong></td>
        ${METRICS.map((metric) => `<td>${renderMetricDelta(opt, metric.key)}</td>`).join('')}
        <td>${escapeHtml(opt.improvement)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function renderMetricDelta(opt: OptimizationResult, key: MetricKey): string {
  const before = readMetric(opt.before, key);
  const after = readMetric(opt.after, key);
  if (before == null && after == null) {
    return '<span class="muted">n/a</span>';
  }
  const delta = before && after != null ? ((before - after) / before) * 100 : 0;
  const direction = Math.abs(delta) < 0.1 ? 'unchanged' : delta > 0 ? 'improved' : 'regressed';
  return `<div>${formatMetric(key, before)} -> ${formatMetric(key, after)}</div><span class="delta ${direction}">${delta > 0 ? '-' : '+'}${Math.abs(delta).toFixed(1)}%</span>`;
}

function renderSuggestion(suggestion: Suggestion, optimization?: OptimizationResult): string {
  const tested = optimization ? renderOptimizationTable([optimization]) : '<p class="muted">This fix has not been tested yet. Reload this report after testing completes to see paired metrics and screenshots.</p>';
  return `<div class="item">
    <div class="item-head">
      <h3>${escapeHtml(suggestion.name)}</h3>
      ${pill(`${suggestion.impact} impact`, suggestion.impact)}
    </div>
    <p>${escapeHtml(suggestion.explanation)}</p>
    ${suggestion.expectedImprovement ? `<p><strong>Expected impact:</strong> ${escapeHtml(suggestion.expectedImprovement)}</p>` : ''}
    ${suggestion.evidence ? `<p class="muted"><strong>Evidence:</strong> ${escapeHtml(suggestion.evidence)}</p>` : ''}
    <div style="margin-top:12px">${tested}</div>
    ${optimization ? `<div class="screens" style="margin-top:12px">
      ${renderScreenshot(`Original control for: ${optimization.name}`, optimization.beforeScreenshot)}
      ${renderScreenshot(`Applied fix: ${optimization.name}`, optimization.screenshot)}
    </div>` : ''}
  </div>`;
}

function renderReportList(title: string, items: string[] | undefined): string {
  return `<div>
    <h3>${escapeHtml(title)}</h3>
    ${renderList(items)}
  </div>`;
}

function renderList(items: string[] | undefined): string {
  if (!items || items.length === 0) {
    return '<p class="muted">No items recorded.</p>';
  }
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderScreenshot(label: string, screenshot: string | undefined): string {
  const src = screenshot ? imageSrc(screenshot) : undefined;
  if (!src) {
    return `<div class="panel muted">No screenshot recorded for ${escapeHtml(label)}.</div>`;
  }
  return `<figure>
    <figcaption>${escapeHtml(label)}</figcaption>
    <img src="${escapeHtml(src)}" alt="${escapeHtml(label)} screenshot" />
  </figure>`;
}

function imageSrc(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length > 200) {
    return `data:image/png;base64,${trimmed}`;
  }
  return undefined;
}

function pickBestOptimization(optimizations: OptimizationResult[]): OptimizationResult | undefined {
  let best: { opt: OptimizationResult; score: number } | undefined;
  for (const opt of optimizations) {
    const score = METRICS.reduce((total, metric) => {
      const before = readMetric(opt.before, metric.key);
      const after = readMetric(opt.after, metric.key);
      if (!before || after == null) return total;
      return total + ((before - after) / before) * 100;
    }, 0);
    if (!best || score > best.score) {
      best = { opt, score };
    }
  }
  return best?.opt;
}

function readMetric(value: Partial<BaselineResult> | undefined, key: MetricKey): number | undefined {
  const metric = value?.[key];
  return typeof metric === 'number' && Number.isFinite(metric) ? metric : undefined;
}

function getMetricRating(key: MetricKey, value: number): 'good' | 'warn' | 'poor' {
  const thresholds = {
    lcp: { good: 2500, poor: 4000 },
    cls: { good: 0.1, poor: 0.25 },
    inp: { good: 200, poor: 500 },
    ttfb: { good: 800, poor: 1800 },
  }[key];
  if (value <= thresholds.good) return 'good';
  if (value >= thresholds.poor) return 'poor';
  return 'warn';
}

function ratingLabel(value: 'good' | 'warn' | 'poor'): string {
  return value === 'good' ? 'Good' : value === 'poor' ? 'Poor' : 'Needs improvement';
}

function formatMetric(key: MetricKey, value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return 'n/a';
  }
  if (key === 'cls') {
    return value.toFixed(3);
  }
  return Math.round(value).toLocaleString();
}

function pill(text: string, tone = ''): string {
  return `<span class="pill ${escapeHtml(tone)}">${escapeHtml(text)}</span>`;
}

function readableUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n\n[truncated ${value.length - maxLength} characters]`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char));
}
