import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { BaselineResult, Suggestion, OptimizationResult, SSEEvent } from '../types.js';
import {
  createMcpClient,
  captureTrace,
  takeScreenshot,
  listNetworkRequests,
  closeMcpClient,
  setToolCallLogger,
} from '../mcp/client.js';
import { analyzePerformance } from './gemini.js';

type Emit = (event: SSEEvent) => void;

// Tagged logger so concurrent runs are distinguishable in the backend console.
function logStep(scope: string, sessionId: string, msg: string): void {
  console.log(`[${scope} ${sessionId.slice(0, 8)}] ${msg}`);
}

function parseMetrics(traceResult: any): Partial<BaselineResult> {
  const metrics: Partial<BaselineResult> = {};

  // The trace result comes back from MCP as { content: [...] }
  // Extract text content and parse metrics from it
  const text = extractText(traceResult);

  // Trace formats values >= 1000 with a thousands comma (e.g. "TTFB: 1,350 ms"),
  // so accept commas in the capture and strip them before parsing. Without this,
  // any metric >= 1s (common on cold loads) silently drops to n/a.
  const num = (s: string): number => parseFloat(s.replace(/,/g, ''));

  // Try to parse LCP, CLS, INP, TTFB from the trace analysis text
  const lcpMatch = text.match(/LCP[:\s]*([0-9.,]+)\s*(ms|s)/i);
  if (lcpMatch) {
    metrics.lcp = lcpMatch[2] === 's' ? num(lcpMatch[1]) * 1000 : num(lcpMatch[1]);
  }

  const clsMatch = text.match(/CLS[:\s]*([0-9.]+)/i);
  if (clsMatch) {
    metrics.cls = parseFloat(clsMatch[1]);
  }

  const inpMatch = text.match(/INP[:\s]*([0-9.,]+)\s*(ms|s)/i);
  if (inpMatch) {
    metrics.inp = inpMatch[2] === 's' ? num(inpMatch[1]) * 1000 : num(inpMatch[1]);
  }

  const ttfbMatch = text.match(/TTFB[:\s]*([0-9.,]+)\s*(ms|s)/i);
  if (ttfbMatch) {
    metrics.ttfb = ttfbMatch[2] === 's' ? num(ttfbMatch[1]) * 1000 : num(ttfbMatch[1]);
  }

  if (!lcpMatch && !clsMatch && !inpMatch && !ttfbMatch) {
    console.warn(
      '[parseMetrics] No metrics matched in trace text. Raw text follows:\n' + text
    );
  }

  return metrics;
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
    const traceResult = await captureTrace(mcpClient, url);

    emit({ type: 'status', data: 'Taking page screenshot...' });
    const screenshotResult = await takeScreenshot(mcpClient);

    emit({ type: 'status', data: 'Capturing network requests...' });
    const networkResult = await listNetworkRequests(mcpClient);

    const traceText = extractText(traceResult);
    const networkText = extractText(networkResult);
    const screenshotText = extractText(screenshotResult);

    const metrics = parseMetrics(traceResult);
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

    const baseline: BaselineResult = {
      lcp: metrics.lcp ?? 0,
      cls: metrics.cls ?? 0,
      inp: metrics.inp ?? 0,
      ttfb: metrics.ttfb ?? 0,
      screenshot: screenshotText,
      traceData: traceText,
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
    const traceResult = await captureTrace(client, url, initScript);
    runs.push(parseMetrics(traceResult));
    if (i === samples - 1) {
      screenshot = extractText(await takeScreenshot(client));
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
    data: `Testing ${selectedFixes.length} fix(es) — median of ${OPTIMIZATION_SAMPLES} runs each...`,
  });

  try {
    // Measure an in-session control (no fix) under the same network window as
    // the treatments. The saved baseline can be minutes stale, so comparing
    // against it conflates the fix's effect with network drift — which is what
    // produced "after is slower than before" results.
    emit({ type: 'status', data: `Measuring control (no fix, ${OPTIMIZATION_SAMPLES} runs)...` });
    mcpClient = await createMcpClient();
    const control = await measureMedian(mcpClient, url, undefined, OPTIMIZATION_SAMPLES);
    const before = {
      lcp: control.metrics.lcp ?? baselineMetrics.lcp,
      cls: control.metrics.cls ?? baselineMetrics.cls,
      inp: control.metrics.inp ?? baselineMetrics.inp,
      ttfb: control.metrics.ttfb ?? baselineMetrics.ttfb,
    };
    logStep('Optimize', sessionId, `control medians: LCP=${before.lcp} CLS=${before.cls} TTFB=${before.ttfb}`);

    for (let i = 0; i < selectedFixes.length; i++) {
      const fix = selectedFixes[i];
      logStep('Optimize', sessionId, `testing fix ${fix.id}: ${fix.name}`);
      emit({
        type: 'status',
        data: `[${i + 1}/${selectedFixes.length}] Testing: ${fix.name} (${OPTIMIZATION_SAMPLES} runs)`,
      });

      // Fresh MCP client per fix to avoid state leaks between runs.
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

    // Combined LCP improvement vs the in-session control.
    let totalLcpImprovement = 0;
    for (const opt of optimizations) {
      if (before.lcp > 0 && opt.after.lcp != null) {
        totalLcpImprovement += ((before.lcp - opt.after.lcp) / before.lcp) * 100;
      }
    }
    const totalImprovement = totalLcpImprovement > 0
      ? `Estimated LCP improvement: -${totalLcpImprovement.toFixed(1)}% (combined, vs in-session control)`
      : 'No measurable improvement (within run-to-run noise)';

    emit({ type: 'complete', data: { optimizations, totalImprovement } });

    return optimizations;
  } finally {
    if (mcpClient) {
      await closeMcpClient(mcpClient);
    }
  }
}
