import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { BaselineResult, Suggestion, OptimizationResult, SSEEvent } from '../types.js';
import {
  createMcpClient,
  navigatePage,
  startTrace,
  analyzeTrace,
  takeScreenshot,
  listNetworkRequests,
  closeMcpClient,
} from '../mcp/client.js';
import { analyzePerformance } from './gemini.js';

type Emit = (event: SSEEvent) => void;

function parseMetrics(traceResult: any): Partial<BaselineResult> {
  const metrics: Partial<BaselineResult> = {};

  // The trace result comes back from MCP as { content: [...] }
  // Extract text content and parse metrics from it
  const text = extractText(traceResult);

  // Try to parse LCP, CLS, INP, TTFB from the trace analysis text
  const lcpMatch = text.match(/LCP[:\s]*([0-9.]+)\s*(ms|s)/i);
  if (lcpMatch) {
    metrics.lcp = lcpMatch[2] === 's' ? parseFloat(lcpMatch[1]) * 1000 : parseFloat(lcpMatch[1]);
  }

  const clsMatch = text.match(/CLS[:\s]*([0-9.]+)/i);
  if (clsMatch) {
    metrics.cls = parseFloat(clsMatch[1]);
  }

  const inpMatch = text.match(/INP[:\s]*([0-9.]+)\s*(ms|s)/i);
  if (inpMatch) {
    metrics.inp = inpMatch[2] === 's' ? parseFloat(inpMatch[1]) * 1000 : parseFloat(inpMatch[1]);
  }

  const ttfbMatch = text.match(/TTFB[:\s]*([0-9.]+)\s*(ms|s)/i);
  if (ttfbMatch) {
    metrics.ttfb = ttfbMatch[2] === 's' ? parseFloat(ttfbMatch[1]) * 1000 : parseFloat(ttfbMatch[1]);
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
  emit({ type: 'status', data: 'Launching browser session...' });

  const mcpClient = await createMcpClient();

  try {
    emit({ type: 'status', data: `Navigating to ${url}...` });
    await navigatePage(mcpClient, url);
    emit({ type: 'status', data: 'Page loaded successfully.' });

    emit({ type: 'status', data: 'Running baseline performance trace...' });
    const traceResult = await startTrace(mcpClient);
    emit({ type: 'status', data: 'Trace captured. Waiting for metrics to settle...' });

    // Give the auto-stop trace a moment to finish, then analyze
    await delay(2000);

    emit({ type: 'status', data: 'Analyzing trace data...' });
    const analysisResult = await analyzeTrace(mcpClient);

    emit({ type: 'status', data: 'Taking page screenshot...' });
    const screenshotResult = await takeScreenshot(mcpClient);

    emit({ type: 'status', data: 'Capturing network requests...' });
    const networkResult = await listNetworkRequests(mcpClient);

    const traceText = extractText(analysisResult);
    const networkText = extractText(networkResult);
    const screenshotText = extractText(screenshotResult);

    const metrics = parseMetrics(analysisResult);
    emit({ type: 'status', data: `Baseline metrics — LCP: ${metrics.lcp ?? 0}ms, CLS: ${metrics.cls ?? 0}, TTFB: ${metrics.ttfb ?? 0}ms` });

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

    const { report, suggestions } = await analyzePerformance(traceText, networkText, url);
    baseline.report = report;
    emit({ type: 'status', data: `Gemini returned ${suggestions.length} suggestion(s).` });

    emit({ type: 'suggestions', data: suggestions });

    return { baseline, suggestions, mcpClient };
  } catch (err) {
    await closeMcpClient(mcpClient);
    throw err;
  }
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

  emit({ type: 'status', data: `Testing ${selectedFixes.length} fix(es)...` });

  try {
    for (let i = 0; i < selectedFixes.length; i++) {
      const fix = selectedFixes[i];
      emit({ type: 'status', data: `[${i + 1}/${selectedFixes.length}] Testing: ${fix.name}` });

      // Create a fresh MCP client for each optimization to avoid state leaks
      if (mcpClient) {
        await closeMcpClient(mcpClient);
      }
      emit({ type: 'status', data: `[${i + 1}/${selectedFixes.length}] Launching fresh browser session...` });
      mcpClient = await createMcpClient();

      // Navigate with the fix's initScript applied
      emit({ type: 'status', data: `[${i + 1}/${selectedFixes.length}] Navigating with fix applied...` });
      await navigatePage(mcpClient, url, fix.initScript);

      // Run trace with the fix applied
      emit({ type: 'status', data: `[${i + 1}/${selectedFixes.length}] Running performance trace...` });
      await startTrace(mcpClient);
      await delay(2000);

      emit({ type: 'status', data: `[${i + 1}/${selectedFixes.length}] Analyzing trace results...` });
      const analysisResult = await analyzeTrace(mcpClient);

      emit({ type: 'status', data: `[${i + 1}/${selectedFixes.length}] Taking screenshot...` });
      const screenshotResult = await takeScreenshot(mcpClient);

      const afterMetrics = parseMetrics(analysisResult);
      const screenshotText = extractText(screenshotResult);

      // Calculate improvement for each metric
      const improvements: string[] = [];
      if (baselineMetrics.lcp > 0 && afterMetrics.lcp != null) {
        const pct = ((baselineMetrics.lcp - afterMetrics.lcp) / baselineMetrics.lcp * 100).toFixed(1);
        if (parseFloat(pct) > 0) improvements.push(`LCP -${pct}%`);
      }
      if (baselineMetrics.cls > 0 && afterMetrics.cls != null) {
        const pct = ((baselineMetrics.cls - afterMetrics.cls) / baselineMetrics.cls * 100).toFixed(1);
        if (parseFloat(pct) > 0) improvements.push(`CLS -${pct}%`);
      }
      if (baselineMetrics.ttfb > 0 && afterMetrics.ttfb != null) {
        const pct = ((baselineMetrics.ttfb - afterMetrics.ttfb) / baselineMetrics.ttfb * 100).toFixed(1);
        if (parseFloat(pct) > 0) improvements.push(`TTFB -${pct}%`);
      }

      const improvementStr = improvements.length > 0 ? improvements.join(', ') : 'No measurable improvement';

      const optResult: OptimizationResult = {
        id: fix.id,
        name: fix.name,
        before: {
          lcp: baselineMetrics.lcp,
          cls: baselineMetrics.cls,
          inp: baselineMetrics.inp,
          ttfb: baselineMetrics.ttfb,
        },
        after: {
          lcp: afterMetrics.lcp ?? 0,
          cls: afterMetrics.cls ?? 0,
          inp: afterMetrics.inp ?? 0,
          ttfb: afterMetrics.ttfb ?? 0,
        },
        improvement: improvementStr,
        screenshot: screenshotText,
        initScript: fix.initScript,
        postLoadScript: fix.postLoadScript,
        explanation: fix.explanation,
      };

      optimizations.push(optResult);
      emit({ type: 'status', data: `[${i + 1}/${selectedFixes.length}] Result: ${improvementStr}` });
      emit({ type: 'optimization', data: optResult });
    }

    // Calculate total improvement summary
    let totalLcpImprovement = 0;
    for (const opt of optimizations) {
      if (baselineMetrics.lcp > 0 && opt.after.lcp != null) {
        totalLcpImprovement += ((baselineMetrics.lcp - opt.after.lcp) / baselineMetrics.lcp) * 100;
      }
    }
    const totalImprovement = totalLcpImprovement > 0
      ? `Estimated LCP improvement: -${totalLcpImprovement.toFixed(1)}% (combined)`
      : 'No measurable improvement';

    emit({ type: 'complete', data: { optimizations, totalImprovement } });

    return optimizations;
  } finally {
    if (mcpClient) {
      await closeMcpClient(mcpClient);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
