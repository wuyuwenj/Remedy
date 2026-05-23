import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { BaselineResult, Suggestion, OptimizationResult, SSEEvent } from '../types.js';
import {
  createMcpClient,
  captureTrace,
  evaluateScript,
  takeScreenshot,
  listNetworkRequests,
  closeMcpClient,
  setToolCallLogger,
  runLighthouse,
} from '../mcp/client.js';
import { analyzePerformance } from './gemini.js';

type Emit = (event: SSEEvent) => void;

const REMEDY_VITALS_INIT_SCRIPT = `
(() => {
  window.__remedyVitals = {
    lcp: undefined,
    cls: 0,
    inp: undefined,
    lcpEntries: [],
    clsEntries: []
  };

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        window.__remedyVitals.lcp = last.startTime;
        window.__remedyVitals.lcpEntries.push({
          startTime: last.startTime,
          renderTime: last.renderTime,
          loadTime: last.loadTime,
          size: last.size,
          url: last.url || '',
          element: last.element ? last.element.tagName : ''
        });
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}

  try {
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__remedyVitals.cls += entry.value;
          window.__remedyVitals.clsEntries.push({
            startTime: entry.startTime,
            value: entry.value
          });
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {}

  try {
    const eventObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = entry.duration || 0;
        if (duration > (window.__remedyVitals.inp || 0)) {
          window.__remedyVitals.inp = duration;
        }
      }
    });
    eventObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {}
})();
`;

function composeInitScript(fixInitScript?: string): string {
  return [REMEDY_VITALS_INIT_SCRIPT, fixInitScript?.trim()].filter(Boolean).join('\n;\n');
}

// Tagged logger so concurrent runs are distinguishable in the backend console.
function logStep(scope: string, sessionId: string, msg: string): void {
  console.log(`[${scope} ${sessionId.slice(0, 8)}] ${msg}`);
}

function parseMetrics(traceResult: any, performanceResult?: any): Partial<BaselineResult> {
  const metrics: Partial<BaselineResult> = {};
  const performanceMetrics = parsePerformanceMetrics(performanceResult);
  if (performanceMetrics.lcp != null) metrics.lcp = performanceMetrics.lcp;
  if (performanceMetrics.cls != null) metrics.cls = performanceMetrics.cls;
  if (performanceMetrics.inp != null) metrics.inp = performanceMetrics.inp;
  if (performanceMetrics.ttfb != null) metrics.ttfb = performanceMetrics.ttfb;

  // The trace result comes back from MCP as { content: [...] }
  // Extract text content and parse metrics from it
  const text = extractText(traceResult);

  // Trace formats values >= 1000 with a thousands comma (e.g. "TTFB: 1,350 ms"),
  // so accept commas in the capture and strip them before parsing. Without this,
  // any metric >= 1s (common on cold loads) silently drops to n/a.
  const num = (s: string): number => parseFloat(s.replace(/,/g, ''));

  // Try to parse LCP, CLS, INP, TTFB from the trace analysis text
  const lcpMatch = text.match(/LCP[:\s]*([0-9.,]+)\s*(ms|s)/i);
  if (metrics.lcp == null && lcpMatch) {
    metrics.lcp = lcpMatch[2] === 's' ? num(lcpMatch[1]) * 1000 : num(lcpMatch[1]);
  }

  const clsMatch = text.match(/CLS[:\s]*([0-9.]+)/i);
  if (metrics.cls == null && clsMatch) {
    metrics.cls = parseFloat(clsMatch[1]);
  }

  const inpMatch = text.match(/INP[:\s]*([0-9.,]+)\s*(ms|s)/i);
  if (metrics.inp == null && inpMatch) {
    metrics.inp = inpMatch[2] === 's' ? num(inpMatch[1]) * 1000 : num(inpMatch[1]);
  }

  const ttfbMatch = text.match(/TTFB[:\s]*([0-9.,]+)\s*(ms|s)/i);
  if (metrics.ttfb == null && ttfbMatch) {
    metrics.ttfb = ttfbMatch[2] === 's' ? num(ttfbMatch[1]) * 1000 : num(ttfbMatch[1]);
  }

  if (!lcpMatch && !clsMatch && !inpMatch && !ttfbMatch) {
    console.warn(
      '[parseMetrics] No metrics matched in trace text. Raw text follows:\n' + text
    );
  }

  return metrics;
}

function parsePerformanceMetrics(result: any): Partial<BaselineResult> {
  const text = extractText(result);
  if (!text) return {};

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};

  try {
    const parsed = JSON.parse(match[0]);
    return {
      lcp: numberOrUndefined(parsed.lcp),
      cls: numberOrUndefined(parsed.cls),
      inp: numberOrUndefined(parsed.inp),
      ttfb: numberOrUndefined(parsed.ttfb),
    };
  } catch {
    return {};
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function metricRating(metric: keyof Pick<BaselineResult, 'lcp' | 'cls' | 'inp' | 'ttfb'>, value: number | undefined): 'good' | 'needs-improvement' | 'poor' | 'unknown' {
  if (value == null || !Number.isFinite(value) || value <= 0) return 'unknown';
  const thresholds = {
    lcp: { good: 2500, poor: 4000 },
    cls: { good: 0.1, poor: 0.25 },
    inp: { good: 200, poor: 500 },
    ttfb: { good: 800, poor: 1800 },
  }[metric];
  if (value <= thresholds.good) return 'good';
  if (value >= thresholds.poor) return 'poor';
  return 'needs-improvement';
}

function formatMetricForOverlay(metric: keyof Pick<BaselineResult, 'lcp' | 'cls' | 'inp' | 'ttfb'>, value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return 'n/a';
  if (metric === 'cls') return value.toFixed(3);
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function statsOverlayScript(metrics: Partial<BaselineResult>, label: string): string {
  const rows = (['lcp', 'cls', 'inp', 'ttfb'] as const).map((key) => ({
    label: key.toUpperCase(),
    display: formatMetricForOverlay(key, metrics[key]),
    rating: metricRating(key, metrics[key]),
  }));
  const payload = JSON.stringify({ title: label, rows });
  return `() => {
    const data = ${payload};
    document.querySelectorAll('[data-remedy-stats]').forEach((el) => el.remove());
    const colors = { good: '#10b981', 'needs-improvement': '#f59e0b', poor: '#ef4444', unknown: '#a1a1aa' };
    const panel = document.createElement('div');
    panel.setAttribute('data-remedy-stats', 'true');
    panel.style.cssText = [
      'position:fixed',
      'top:12px',
      'left:12px',
      'z-index:2147483647',
      'background:rgba(9,9,11,.94)',
      'color:#fafafa',
      'font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'border:1px solid rgba(255,255,255,.14)',
      'border-radius:6px',
      'padding:10px 12px',
      'box-shadow:0 12px 34px rgba(0,0,0,.45)',
      'min-width:196px',
      'backdrop-filter:blur(6px)'
    ].join(';');
    const head = document.createElement('div');
    head.textContent = 'Core Web Vitals - ' + data.title;
    head.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#a1a1aa;';
    panel.appendChild(head);
    data.rows.forEach((row) => {
      const line = document.createElement('div');
      line.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:18px;padding:3px 0;';
      const name = document.createElement('span');
      name.textContent = row.label;
      name.style.color = '#d4d4d8';
      const value = document.createElement('span');
      value.textContent = row.display;
      value.style.cssText = 'font-weight:700;color:' + (colors[row.rating] || colors.unknown) + ';';
      line.appendChild(name);
      line.appendChild(value);
      panel.appendChild(line);
    });
    (document.body || document.documentElement).appendChild(panel);
    return { ok: true, rows: data.rows.length };
  }`;
}

async function captureScreenshotWithOverlay(
  client: Client,
  metrics: Partial<BaselineResult>,
  label: string
): Promise<string> {
  await evaluateScript(client, statsOverlayScript(metrics, label));
  await new Promise((resolve) => setTimeout(resolve, 150));
  return extractScreenshot(await takeScreenshot(client));
}

async function readPerformanceMetrics(client: Client): Promise<any> {
  return evaluateScript(client, `() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime])
    );
    const vitals = window.__remedyVitals || {};
    return {
      source: 'performance-api',
      lcp: typeof vitals.lcp === 'number' ? vitals.lcp : undefined,
      cls: typeof vitals.cls === 'number' ? vitals.cls : undefined,
      inp: typeof vitals.inp === 'number' ? vitals.inp : undefined,
      ttfb: nav ? nav.responseStart : undefined,
      fcp: paints['first-contentful-paint'],
      load: nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : undefined,
      resourceCount: performance.getEntriesByType('resource').length,
      transferSize: nav ? nav.transferSize : undefined,
      encodedBodySize: nav ? nav.encodedBodySize : undefined,
      lcpEntries: vitals.lcpEntries || [],
      clsEntries: vitals.clsEntries || []
    };
  }`);
}

function extractText(result: any): string {
  if (typeof result === 'string') return result;
  if (result?.content) {
    if (Array.isArray(result.content)) {
      return result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
    }
    if (typeof result.content === 'string') return result.content;
  }
  return JSON.stringify(result);
}

function extractScreenshot(result: any): string {
  const image = extractImageData(result);
  if (image) {
    return image;
  }

  const text = extractText(result).trim();
  const dataUriMatch = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUriMatch) {
    return dataUriMatch[0];
  }

  const base64Match = text.match(/[A-Za-z0-9+/]{200,}={0,2}/);
  if (base64Match) {
    return base64Match[0];
  }

  console.warn('[Screenshot] No image data found in take_screenshot result. Text preview:', text.slice(0, 200));
  return '';
}

function extractImageData(value: any): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageData(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;

  if (typeof value.data === 'string' && typeof value.mimeType === 'string' && value.mimeType.startsWith('image/')) {
    return `data:${value.mimeType};base64,${value.data}`;
  }
  if (typeof value.data === 'string' && value.type === 'image') {
    return `data:${value.mimeType || 'image/png'};base64,${value.data}`;
  }
  if (typeof value.imageData === 'string') {
    return value.imageData.startsWith('data:') ? value.imageData : `data:image/png;base64,${value.imageData}`;
  }

  for (const key of ['content', 'structuredContent', 'result'] as const) {
    const found = extractImageData(value[key]);
    if (found) return found;
  }

  return undefined;
}

function parseLighthouseScore(result: any): number | undefined {
  const text = extractText(result);
  const match = text.match(/performance[:\s]*(\d{1,3})/i)
    || text.match(/score[:\s]*(\d{1,3})/i);
  if (match) {
    const score = parseInt(match[1], 10);
    if (score >= 0 && score <= 100) return score;
  }
  return undefined;
}

export async function runBaseline(
  sessionId: string,
  url: string,
  emit: Emit
): Promise<{ baseline: BaselineResult; suggestions: Suggestion[]; mcpClient: Client }> {
  setToolCallLogger((tool, args) => {
    const detail = tool === 'navigate_page' ? ` → ${args.url}` : '';
    emit({ type: 'status', data: `🔧 MCP tool: ${tool}${detail}` });
  });

  logStep('Baseline', sessionId, `starting for ${url}`);
  emit({ type: 'status', data: 'Launching browser session...' });

  const mcpClient = await createMcpClient();

  try {
    logStep('Baseline', sessionId, 'capturing performance trace...');
    emit({ type: 'status', data: 'Running baseline performance trace...' });
    // captureTrace drives the load itself so heavy pages that exceed the trace
    // tool's hardcoded 10s reload still get captured. The summary (with metrics)
    // is appended to this result — the data source parseMetrics needs.
    const traceResult = await captureTrace(mcpClient, url, composeInitScript());
    const performanceResult = await readPerformanceMetrics(mcpClient);

    emit({ type: 'status', data: 'Capturing network requests & Lighthouse audit...' });
    const [networkResult, lighthouseResult] = await Promise.all([
      listNetworkRequests(mcpClient),
      runLighthouse(mcpClient, url).catch((err) => {
        console.warn('[Baseline] Lighthouse audit failed (non-fatal):', err);
        return null;
      }),
    ]);

    const traceText = extractText(traceResult);
    const networkText = extractText(networkResult);
    const metrics = parseMetrics(traceResult, performanceResult);
    const screenshot = await captureScreenshotWithOverlay(mcpClient, metrics, 'Original');
    logStep(
      'Baseline',
      sessionId,
      `parsed metrics: LCP=${metrics.lcp ?? 'n/a'} CLS=${metrics.cls ?? 'n/a'} ` +
        `INP=${metrics.inp ?? 'n/a'} TTFB=${metrics.ttfb ?? 'n/a'} (trace ${traceText.length} chars)`
    );

    // Fail fast if the trace yielded no usable metrics (e.g. navigation timed
    // out). Without this we'd waste a slow Gemini call analyzing an error string
    // and surface zeros / a cryptic parse error instead of a clear cause.
    if (metrics.lcp == null && metrics.cls == null && metrics.inp == null && metrics.ttfb == null) {
      const reason = /timeout/i.test(traceText)
        ? "the page didn't finish loading within Chrome's 10s headless trace limit — it may be too heavy or block headless browsers"
        : 'no performance metrics were found in the trace output';
      throw new Error(
        `Couldn't capture a performance trace for ${url}: ${reason}. Try a lighter page or a specific route.`
      );
    }

    emit({
      type: 'status',
      data: `Baseline metrics — LCP: ${metrics.lcp ?? 0}ms, CLS: ${metrics.cls ?? 0}, TTFB: ${metrics.ttfb ?? 0}ms`,
    });

    const lighthouseScore = lighthouseResult ? parseLighthouseScore(lighthouseResult) : undefined;
    if (lighthouseScore != null) {
      logStep('Baseline', sessionId, `Lighthouse performance score: ${lighthouseScore}`);
      emit({ type: 'lighthouse', data: { phase: 'before', score: lighthouseScore } });
    }

    const baseline: BaselineResult = {
      lcp: metrics.lcp ?? 0,
      cls: metrics.cls ?? 0,
      inp: metrics.inp ?? 0,
      ttfb: metrics.ttfb ?? 0,
      lighthouseScore,
      screenshot,
      traceData: `${traceText}\n\n=== PERFORMANCE API METRICS ===\n${extractText(performanceResult)}`,
      networkData: networkText,
    };

    emit({ type: 'baseline', data: baseline });
    emit({ type: 'status', data: 'Sending trace + network data to Gemini for analysis...' });

    logStep('Baseline', sessionId, 'calling Gemini for analysis...');
    const { report, suggestions } = await analyzePerformance(traceText, networkText, url);
    baseline.report = report;
    logStep('Baseline', sessionId, `Gemini returned ${suggestions.length} suggestions`);
    emit({ type: 'status', data: `Gemini returned ${suggestions.length} suggestion(s).` });

    emit({ type: 'suggestions', data: suggestions });

    return { baseline, suggestions, mcpClient };
  } catch (err) {
    logStep('Baseline', sessionId, `FAILED: ${err instanceof Error ? err.message : String(err)}`);
    await closeMcpClient(mcpClient);
    throw err;
  }
}

const OPTIMIZATION_SAMPLES = process.env.OPTIMIZATION_SAMPLES
  ? Math.max(1, parseInt(process.env.OPTIMIZATION_SAMPLES, 10))
  : 3;

function median(values: Array<number | undefined>): number | undefined {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (v.length === 0) return undefined;
  return v[Math.floor((v.length - 1) / 2)];
}

// Runs captureTrace `samples` times and returns the per-metric median (to beat
// down run-to-run network noise) plus the last run's screenshot.
async function measureMedian(
  client: Client,
  url: string,
  initScript: string | undefined,
  samples: number
): Promise<{ metrics: Partial<BaselineResult>; screenshot: string }> {
  const runs: Partial<BaselineResult>[] = [];
  let screenshot = '';
  for (let i = 0; i < samples; i++) {
    const traceResult = await captureTrace(client, url, composeInitScript(initScript));
    const performanceResult = await readPerformanceMetrics(client);
    runs.push(parseMetrics(traceResult, performanceResult));
    if (i === samples - 1) {
      screenshot = await captureScreenshotWithOverlay(client, runs[runs.length - 1], initScript ? 'Treatment' : 'Original');
    }
  }
  return {
    metrics: {
      lcp: median(runs.map((r) => r.lcp)),
      cls: median(runs.map((r) => r.cls)),
      inp: median(runs.map((r) => r.inp)),
      ttfb: median(runs.map((r) => r.ttfb)),
    },
    screenshot,
  };
}

export async function runOptimizations(
  sessionId: string,
  url: string,
  fixIds: string[],
  suggestions: Suggestion[],
  baselineMetrics: BaselineResult,
  emit: Emit
): Promise<OptimizationResult[]> {
  const selectedFixes = suggestions.filter((s) => fixIds.includes(s.id));
  const optimizations: OptimizationResult[] = [];
  let mcpClient: Client | null = null;

  setToolCallLogger((tool, args) => {
    const detail = tool === 'navigate_page' ? ` → ${args.url}` : '';
    emit({ type: 'status', data: `🔧 MCP tool: ${tool}${detail}` });
  });

  emit({
    type: 'status',
    data: `Testing ${selectedFixes.length} fix(es) — paired control/treatment, median of ${OPTIMIZATION_SAMPLES} runs each...`,
  });

  try {
    for (let i = 0; i < selectedFixes.length; i++) {
      const fix = selectedFixes[i];
      logStep('Optimize', sessionId, `testing fix ${fix.id}: ${fix.name}`);
      emit({
        type: 'status',
        data: `[${i + 1}/${selectedFixes.length}] Measuring original control for: ${fix.name}`,
      });

      if (mcpClient) {
        await closeMcpClient(mcpClient);
      }
      mcpClient = await createMcpClient();
      const control = await measureMedian(mcpClient, url, undefined, OPTIMIZATION_SAMPLES);
      const before = {
        lcp: control.metrics.lcp ?? baselineMetrics.lcp,
        cls: control.metrics.cls ?? baselineMetrics.cls,
        inp: control.metrics.inp ?? baselineMetrics.inp,
        ttfb: control.metrics.ttfb ?? baselineMetrics.ttfb,
      };
      logStep('Optimize', sessionId, `fix ${fix.id} control medians: LCP=${before.lcp} CLS=${before.cls} TTFB=${before.ttfb}`);

      emit({
        type: 'status',
        data: `[${i + 1}/${selectedFixes.length}] Measuring treatment for: ${fix.name}`,
      });

      await closeMcpClient(mcpClient);
      mcpClient = await createMcpClient();

      const treatment = await measureMedian(mcpClient, url, fix.initScript, OPTIMIZATION_SAMPLES);
      const afterMetrics = treatment.metrics;
      logStep(
        'Optimize',
        sessionId,
        `fix ${fix.id} medians: LCP=${afterMetrics.lcp ?? 'n/a'} CLS=${afterMetrics.cls ?? 'n/a'} ` +
          `TTFB=${afterMetrics.ttfb ?? 'n/a'}`
      );

      // Only LCP and CLS are affectable by these client-side fixes. TTFB is
      // server-side and INP needs an interaction (always n/a here), so they are
      // excluded from the verdict — including them just reports network noise.
      const improvements: string[] = [];
      if (before.lcp > 0 && afterMetrics.lcp != null) {
        const pct = ((before.lcp - afterMetrics.lcp) / before.lcp * 100).toFixed(1);
        if (parseFloat(pct) > 0) improvements.push(`LCP -${pct}%`);
      }
      if (before.cls > 0 && afterMetrics.cls != null) {
        const pct = ((before.cls - afterMetrics.cls) / before.cls * 100).toFixed(1);
        if (parseFloat(pct) > 0) improvements.push(`CLS -${pct}%`);
      }

      const improvementStr = improvements.length > 0 ? improvements.join(', ') : 'No measurable improvement';

      const optResult: OptimizationResult = {
        id: fix.id,
        name: fix.name,
        before: { lcp: before.lcp, cls: before.cls, inp: before.inp, ttfb: before.ttfb },
        after: {
          lcp: afterMetrics.lcp ?? 0,
          cls: afterMetrics.cls ?? 0,
          inp: afterMetrics.inp ?? 0,
          ttfb: afterMetrics.ttfb ?? 0,
        },
        improvement: improvementStr,
        screenshot: treatment.screenshot,
        initScript: fix.initScript,
        postLoadScript: fix.postLoadScript,
        explanation: fix.explanation,
      };

      optimizations.push(optResult);
      emit({ type: 'status', data: `[${i + 1}/${selectedFixes.length}] Result: ${improvementStr}` });
      emit({ type: 'optimization', data: optResult });
    }

    // Run Lighthouse with all fix initScripts combined for an "after" score.
    let lighthouseAfter: number | undefined;
    const allInitScripts = selectedFixes.map((f) => f.initScript).filter(Boolean);
    if (allInitScripts.length > 0) {
      emit({ type: 'status', data: 'Running Lighthouse audit with fixes applied...' });
      try {
        if (mcpClient) await closeMcpClient(mcpClient);
        mcpClient = await createMcpClient();
        const combinedInit = allInitScripts.join(';\n');
        const lhResult = await runLighthouse(mcpClient, url, combinedInit);
        lighthouseAfter = parseLighthouseScore(lhResult);
        if (lighthouseAfter != null) {
          logStep('Optimize', sessionId, `Lighthouse after: ${lighthouseAfter}`);
          emit({ type: 'lighthouse', data: { phase: 'after', score: lighthouseAfter } });
        }
      } catch (err) {
        console.warn('[Optimize] Lighthouse after-audit failed (non-fatal):', err);
      }
    }

    // Combined LCP improvement vs each fix's paired in-session control.
    let totalLcpImprovement = 0;
    for (const opt of optimizations) {
      const beforeLcp = opt.before.lcp;
      if (beforeLcp != null && beforeLcp > 0 && opt.after.lcp != null) {
        totalLcpImprovement += ((beforeLcp - opt.after.lcp) / beforeLcp) * 100;
      }
    }
    const totalImprovement = totalLcpImprovement > 0
      ? `Estimated LCP improvement: -${totalLcpImprovement.toFixed(1)}% (combined, vs paired in-session controls)`
      : 'No measurable improvement (within run-to-run noise)';

    emit({ type: 'complete', data: { optimizations, totalImprovement, lighthouseAfter } });


    return optimizations;
  } finally {
    if (mcpClient) {
      await closeMcpClient(mcpClient);
    }
  }
}
