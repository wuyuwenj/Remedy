import { GoogleGenAI } from "@google/genai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

type Rating = "good" | "needs-improvement" | "poor" | "unknown";
type Severity = "critical" | "high" | "medium" | "low";
type Direction = "improved" | "regressed" | "unchanged" | "unknown";

function log(message: string): void {
  console.error(`[remedy] ${message}`);
}

export type LocalReportOptions = {
  client: Client;
  ai: GoogleGenAI;
  model: string;
  targetUrl: string;
  outputDir?: string;
  viewport?: string;
  maxVariants: number;
};

export type LocalReportResult = {
  htmlPath: string;
  jsonPath: string;
  outputDir: string;
};

type MetricValue = {
  value?: number;
  unit: "ms" | "" | "score" | "count";
  display: string;
  rating: Rating;
};

type MetricMap = {
  lcp?: MetricValue;
  cls?: MetricValue;
  inp?: MetricValue;
  ttfb?: MetricValue;
  fcp?: MetricValue;
  load?: MetricValue;
  requests?: MetricValue;
};

type ScoreBlock = {
  score?: number;
  rating: Rating;
  summary?: string;
};

type Issue = {
  id: string;
  title: string;
  severity: Severity;
  category: "performance" | "accessibility" | "seo" | "ux" | "visual" | "technical";
  description: string;
  evidence: string[];
  recommendation: string;
  confidence: "high" | "medium" | "low";
};

type SuggestionCode = {
  language?: string;
  before?: string;
  after: string;
};

type SuggestionComparison = {
  metric?: string;
  before?: string;
  after?: string;
  summary?: string;
};

type Suggestion = {
  id: string;
  title: string;
  priority: Severity;
  expectedImpact: string;
  recommendation: string;
  implementationNotes: string;
  confidence: "high" | "medium" | "low";
  code?: SuggestionCode;
  comparison?: SuggestionComparison;
};

type VariantPlan = {
  id: string;
  name: string;
  hypothesis: string;
  initScript: string;
  postLoadScript: string;
  changes: Array<{
    type: "css" | "attribute" | "text" | "layout" | "resource-hint" | "script";
    selector?: string;
    description: string;
  }>;
};

type RunResult = {
  id: string;
  label: string;
  kind: "baseline" | "variation";
  timestamp: string;
  screenshot?: string;
  tracePath?: string;
  snapshotPath?: string;
  lighthouseDir?: string;
  lighthouseText?: string;
  traceText?: string;
  networkText?: string;
  consoleText?: string;
  performanceText?: string;
  metrics: MetricMap;
  notes: string[];
};

type VariantResult = RunResult & {
  hypothesis: string;
  changes: VariantPlan["changes"];
  deltas: Array<{
    metric: string;
    before?: number;
    after?: number;
    absoluteDelta?: number;
    percentDelta?: number;
    direction: Direction;
    display: string;
  }>;
  analysis: string;
};

type GeminiPlan = {
  summary: {
    headline: string;
    verdict: "pass" | "needs-work" | "fail";
    narrative: string;
  };
  scores: {
    performance?: ScoreBlock;
    accessibility?: ScoreBlock;
    bestPractices?: ScoreBlock;
    seo?: ScoreBlock;
  };
  analysis: {
    executiveSummary: string;
    frontendComparison: string[];
    performanceComparison: string[];
    goodEnough: string[];
    improveNext: string[];
    missingEvidence: string[];
  };
  issues: Issue[];
  suggestions: Suggestion[];
  variations: VariantPlan[];
};

type StaticReport = {
  schemaVersion: "1.0";
  reportId: string;
  url: string;
  createdAt: string;
  tool: {
    name: "Remedy";
    mode: "local-lighthouse-trace-variation-report";
    viewport: string;
  };
  summary: GeminiPlan["summary"] & {
    totalIssues: number;
    totalSuggestions: number;
    bestVariationId?: string;
  };
  scores: GeminiPlan["scores"];
  baseline: RunResult;
  variations: VariantResult[];
  issues: Issue[];
  suggestions: Suggestion[];
  analysis: GeminiPlan["analysis"];
  evidence: {
    lighthouseNotes: string[];
    networkNotes: string[];
    consoleNotes: string[];
    traceNotes: string[];
  };
};

const DEFAULT_VARIANTS: VariantPlan[] = [
  {
    id: "variant-cta-contrast",
    name: "CTA contrast and tap-target pass",
    hypothesis: "Make prominent buttons and button-like links easier to scan and tap without changing page structure.",
    initScript: genericMutationScript(`
      const style = document.createElement("style");
      style.dataset.remedyVariant = "cta-contrast";
      style.textContent = [
        "button, [role='button'], a[href].button, a[href][class*='button'], a[href][class*='btn'] {",
        "  min-height: 44px !important;",
        "  border-radius: 8px !important;",
        "  box-shadow: 0 1px 2px rgba(0,0,0,.12) !important;",
        "}",
        "main a[href], main button { text-underline-offset: 3px !important; }",
        "a[href]:focus-visible, button:focus-visible { outline: 3px solid #2563eb !important; outline-offset: 3px !important; }"
      ].join("\\n");
      document.documentElement.appendChild(style);
    `),
    postLoadScript: "",
    changes: [
      {
        type: "css",
        selector: "button, [role='button'], prominent links",
        description: "Increase tap target consistency and visible focus treatment for conversion controls."
      }
    ]
  },
  {
    id: "variant-layout-stability",
    name: "Layout stability guardrails",
    hypothesis: "Reserve predictable image/media space and reduce expensive motion to lower visual instability risk.",
    initScript: genericMutationScript(`
      const style = document.createElement("style");
      style.dataset.remedyVariant = "layout-stability";
      style.textContent = [
        "img:not([width]):not([height]) { aspect-ratio: attr(width number) / attr(height number); max-width: 100%; height: auto; }",
        "img, video, iframe { max-width: 100%; }",
        "@media (prefers-reduced-motion: no-preference) { * { scroll-behavior: auto !important; } }",
        "[style*='animation'], [class*='animate'] { animation-duration: .001s !important; animation-iteration-count: 1 !important; }"
      ].join("\\n");
      document.documentElement.appendChild(style);
    `),
    postLoadScript: "",
    changes: [
      {
        type: "css",
        selector: "img, video, iframe, animated elements",
        description: "Constrain media sizing and motion so screenshots reveal whether layout becomes steadier."
      }
    ]
  }
];

export async function generateLocalHtmlReport(options: LocalReportOptions): Promise<LocalReportResult> {
  const reportId = createReportId(options.targetUrl);
  const outputDir = resolve(options.outputDir ?? "reports", reportId);
  const assetsDir = resolve(outputDir, "assets");
  const lighthouseDir = resolve(outputDir, "lighthouse");

  await mkdir(assetsDir, { recursive: true });
  await mkdir(lighthouseDir, { recursive: true });

  if (options.viewport) {
    log(`Emulating viewport ${options.viewport}`);
    await callToolSafe(options.client, "emulate", { viewport: normalizeViewport(options.viewport) });
  }

  log(`Capturing baseline run for ${options.targetUrl}`);
  const baseline = await collectRun({
    client: options.client,
    targetUrl: options.targetUrl,
    outputDir,
    assetsDir,
    lighthouseDir,
    id: "baseline",
    label: "Original",
    kind: "baseline",
    runLighthouse: true
  });

  log("Requesting analysis and safe variations from Gemini");
  const geminiPlan = await createGeminiPlan(options.ai, options.model, options.targetUrl, baseline, options.maxVariants);
  const plans = geminiPlan.variations.slice(0, options.maxVariants);
  log(`Testing ${plans.length} variation(s)`);
  const variants = await collectVariants({
    client: options.client,
    targetUrl: options.targetUrl,
    outputDir,
    assetsDir,
    baselineMetrics: baseline.metrics,
    plans
  });

  const bestVariationId = pickBestVariant(variants);
  const report: StaticReport = {
    schemaVersion: "1.0",
    reportId,
    url: options.targetUrl,
    createdAt: new Date().toISOString(),
    tool: {
      name: "Remedy",
      mode: "local-lighthouse-trace-variation-report",
      viewport: options.viewport ?? "default"
    },
    summary: {
      ...geminiPlan.summary,
      totalIssues: geminiPlan.issues.length,
      totalSuggestions: geminiPlan.suggestions.length,
      bestVariationId
    },
    scores: mergeScores(geminiPlan.scores, baseline),
    baseline,
    variations: variants,
    issues: geminiPlan.issues,
    suggestions: geminiPlan.suggestions,
    analysis: geminiPlan.analysis,
    evidence: {
      lighthouseNotes: topLines(baseline.lighthouseText, 12),
      networkNotes: topLines(baseline.networkText, 12),
      consoleNotes: topLines(baseline.consoleText, 12),
      traceNotes: topLines(baseline.traceText, 12)
    }
  };

  log("Writing HTML report and report.json");
  const jsonPath = resolve(outputDir, "report.json");
  const htmlPath = resolve(outputDir, "index.html");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(htmlPath, renderHtml(report));

  log(`Report ready: ${htmlPath}`);
  return { htmlPath, jsonPath, outputDir };
}

async function collectRun(args: {
  client: Client;
  targetUrl: string;
  outputDir: string;
  assetsDir: string;
  lighthouseDir?: string;
  id: string;
  label: string;
  kind: "baseline" | "variation";
  initScript?: string;
  postLoadScript?: string;
  runLighthouse: boolean;
}): Promise<RunResult> {
  const notes: string[] = [];
  const screenshotPath = resolve(args.assetsDir, `${args.id}.png`);
  const snapshotPath = resolve(args.outputDir, `${args.id}-snapshot.txt`);
  const tracePath = resolve(args.outputDir, `${args.id}-trace.json.gz`);

  log(`Navigating to capture ${args.label}`);
  await callToolSafe(args.client, "new_page", {
    url: "about:blank",
    timeout: 30000
  });

  await callToolSafe(args.client, "navigate_page", {
    url: args.targetUrl,
    type: "url",
    initScript: args.initScript,
    timeout: 60000
  });
  await delay(1500);

  if (args.postLoadScript?.trim()) {
    const mutation = await callToolSafe(args.client, "evaluate_script", {
      function: wrapScriptAsFunction(args.postLoadScript),
    });
    const mutationText = extractText(mutation);
    if (mutationText) {
      notes.push(`Mutation result: ${mutationText.slice(0, 300)}`);
    }
    await delay(500);
  }

  const snapshotResult = await callToolSafe(args.client, "take_snapshot", {
    filePath: snapshotPath
  });

  let lighthouseText = "";
  if (args.runLighthouse && args.lighthouseDir) {
    // Lighthouse runs a full navigation audit and regularly needs longer than the MCP
    // 60s default request timeout, which is what was killing it. Give it room and reset
    // the timer while it streams progress so a slow-but-healthy audit still completes.
    log(`Running Lighthouse audit for ${args.label} (this can take a minute)`);
    const lighthouseResult = await callToolSafe(
      args.client,
      "lighthouse_audit",
      { mode: "navigation", device: "desktop", outputDirPath: args.lighthouseDir },
      { timeout: 180000, resetTimeoutOnProgress: true }
    );
    lighthouseText = extractText(lighthouseResult);
    if (!/\bscore\b/i.test(lighthouseText) && /\b(failed?|timed?\s*out|timeout|error)\b/i.test(lighthouseText)) {
      log(`Lighthouse audit did not complete cleanly: ${lighthouseText.slice(0, 160)}`);
      notes.push(`Lighthouse audit issue: ${lighthouseText.slice(0, 240)}`);
    }
  }

  log(`Running performance trace for ${args.label}`);
  const traceResult = await callToolSafe(
    args.client,
    "performance_start_trace",
    { reload: true, autoStop: true, filePath: tracePath },
    { timeout: 120000, resetTimeoutOnProgress: true }
  );
  await delay(2500);

  const networkResult = await callToolSafe(args.client, "list_network_requests", {
    pageSize: 100
  });
  const consoleResult = await callToolSafe(args.client, "list_console_messages", {
    pageSize: 50
  });
  const performanceResult = await callToolSafe(args.client, "evaluate_script", {
    function: performanceEntryScript()
  });

  const traceText = extractText(traceResult);
  const networkText = extractText(networkResult);
  const consoleText = extractText(consoleResult);
  const performanceText = extractText(performanceResult);
  const snapshotText = extractText(snapshotResult);
  const snapshot = fileIfExists(args.outputDir, snapshotPath);
  const trace = fileIfExists(args.outputDir, tracePath);
  if (!trace) {
    notes.push("Trace artifact file was not written; using returned trace text only.");
  }
  if (snapshotText) {
    notes.push(`Snapshot saved: ${basename(snapshotPath)}`);
  }

  // Prefer the deterministic Performance API reading over scraping numbers out of free
  // text; the regex fallback is what produced nonsense like "REQUESTS 1 -> 869".
  const metrics = parseMetrics(performanceText, [traceText, lighthouseText, networkText].join("\n\n"));

  // The trace reloads the page and discards post-load mutations, so re-apply the fix
  // before the final shot. Then paint a DevTools-style Core Web Vitals panel so every
  // comparison image shows both the visual state and the measured metrics in one frame.
  if (args.postLoadScript?.trim()) {
    await callToolSafe(args.client, "evaluate_script", {
      function: wrapScriptAsFunction(args.postLoadScript)
    });
    await delay(300);
  }
  log(`Capturing screenshot with metric overlay for ${args.label}`);
  await callToolSafe(args.client, "evaluate_script", {
    function: statsOverlayScript(metrics, args.label)
  });
  const screenshotResult = await callToolSafe(args.client, "take_screenshot", {
    filePath: screenshotPath,
    format: "png",
    fullPage: false
  });
  const screenshotText = extractText(screenshotResult);
  const screenshot = fileIfExists(args.outputDir, screenshotPath);
  if (!screenshot) {
    notes.push(`Screenshot missing. Tool output: ${screenshotText.slice(0, 300) || "empty response"}`);
  }

  return {
    id: args.id,
    label: args.label,
    kind: args.kind,
    timestamp: new Date().toISOString(),
    screenshot,
    tracePath: trace,
    snapshotPath: snapshot,
    lighthouseDir: args.lighthouseDir ? toReportPath(args.outputDir, args.lighthouseDir) : undefined,
    lighthouseText,
    traceText,
    networkText,
    consoleText,
    performanceText,
    metrics,
    notes
  };
}

async function collectVariants(args: {
  client: Client;
  targetUrl: string;
  outputDir: string;
  assetsDir: string;
  baselineMetrics: MetricMap;
  plans: VariantPlan[];
}): Promise<VariantResult[]> {
  const results: VariantResult[] = [];
  let index = 0;
  for (const plan of args.plans) {
    index += 1;
    log(`Testing variation ${index}/${args.plans.length}: ${plan.name}`);
    const run = await collectRun({
      client: args.client,
      targetUrl: args.targetUrl,
      outputDir: args.outputDir,
      assetsDir: args.assetsDir,
      id: safeId(plan.id),
      label: plan.name,
      kind: "variation",
      initScript: plan.initScript,
      postLoadScript: plan.postLoadScript,
      runLighthouse: false
    });

    const deltas = compareMetrics(args.baselineMetrics, run.metrics);
    log(
      `Variation ${plan.name}: ` +
        (deltas.length ? deltas.map((delta) => delta.display).join(" | ") : "no measurable metric movement")
    );
    results.push({
      ...run,
      hypothesis: plan.hypothesis,
      changes: plan.changes,
      deltas,
      analysis: summarizeVariant(plan, deltas)
    });
  }
  return results;
}

async function createGeminiPlan(
  ai: GoogleGenAI,
  model: string,
  targetUrl: string,
  baseline: RunResult,
  maxVariants: number
): Promise<GeminiPlan> {
  const prompt = `
You are Remedy, a frontend and website quality evaluator. Analyze the evidence from Chrome DevTools MCP and produce a structured report plan.

Important tool boundary:
- Chrome DevTools MCP lighthouse_audit reports accessibility, SEO, best practices, and agentic browsing. It excludes performance.
- Performance evidence comes from DevTools trace output, network data, console data, and Performance API data.

Target URL: ${targetUrl}

Return ONLY JSON in this exact shape:
{
  "summary": {
    "headline": "Short report title",
    "verdict": "pass" | "needs-work" | "fail",
    "narrative": "Short executive summary"
  },
  "scores": {
    "performance": { "score": 0-100, "rating": "good" | "needs-improvement" | "poor" | "unknown", "summary": "..." },
    "accessibility": { "score": 0-100, "rating": "good" | "needs-improvement" | "poor" | "unknown", "summary": "..." },
    "bestPractices": { "score": 0-100, "rating": "good" | "needs-improvement" | "poor" | "unknown", "summary": "..." },
    "seo": { "score": 0-100, "rating": "good" | "needs-improvement" | "poor" | "unknown", "summary": "..." }
  },
  "analysis": {
    "executiveSummary": "...",
    "frontendComparison": ["..."],
    "performanceComparison": ["..."],
    "goodEnough": ["..."],
    "improveNext": ["..."],
    "missingEvidence": ["..."]
  },
  "issues": [
    {
      "id": "issue-1",
      "title": "...",
      "severity": "critical" | "high" | "medium" | "low",
      "category": "performance" | "accessibility" | "seo" | "ux" | "visual" | "technical",
      "description": "...",
      "evidence": ["..."],
      "recommendation": "...",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "suggestions": [
    {
      "id": "suggestion-1",
      "title": "...",
      "priority": "critical" | "high" | "medium" | "low",
      "expectedImpact": "...",
      "recommendation": "...",
      "implementationNotes": "...",
      "confidence": "high" | "medium" | "low",
      "code": {
        "language": "html" | "css" | "javascript" | "jsx" | "tsx" | "json" | "nginx" | "diff",
        "before": "Exact current code/markup if it can be inferred from evidence, else omit.",
        "after": "Exact, copy-pasteable code that implements this fix. Self-contained and ready to paste."
      },
      "comparison": {
        "metric": "The single metric this most affects, e.g. LCP.",
        "before": "Observed baseline value for that metric (use the BASELINE METRICS provided), e.g. 3.2s.",
        "after": "Expected value after the fix, clearly an estimate, e.g. ~1.9s (est.).",
        "summary": "One sentence on the expected before/after change and why."
      }
    }
  ],
  "variations": [
    {
      "id": "variant-1",
      "name": "Short visual/performance test name",
      "hypothesis": "What this change is testing",
      "initScript": "Self-contained JavaScript that can run before page scripts. No top-level return.",
      "postLoadScript": "Self-contained JavaScript body that can run after load. No top-level return.",
      "changes": [{ "type": "css", "selector": "...", "description": "..." }]
    }
  ]
}

Create at most ${maxVariants} safe visual variations. Focus on reversible CSS/DOM changes such as button color/contrast, spacing, layout stability, image sizing, or hiding non-essential motion. Do not click, submit forms, sign in, purchase, or modify storage. If the evidence is too weak for custom variants, return generic but useful CSS-only variations.

For every suggestion, fill "code" with an exact, copy-pasteable snippet that implements the fix (the developer should be able to paste it with no edits), and fill "comparison" so the report can show a before/after for that fix. Set comparison.before from the observed BASELINE METRICS below and mark comparison.after explicitly as an estimate. Do not invent observed metrics; estimates must be labelled as such.

=== BASELINE METRICS ===
${JSON.stringify(baseline.metrics, null, 2)}

=== LIGHTHOUSE AUDIT TEXT ===
${truncateForPrompt(baseline.lighthouseText)}

=== TRACE TEXT ===
${truncateForPrompt(baseline.traceText)}

=== NETWORK TEXT ===
${truncateForPrompt(baseline.networkText)}

=== CONSOLE TEXT ===
${truncateForPrompt(baseline.consoleText)}

=== PERFORMANCE API TEXT ===
${truncateForPrompt(baseline.performanceText)}
`.trim();

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = extractGeminiText(response);
    const parsed = JSON.parse(text) as Partial<GeminiPlan>;
    return normalizeGeminiPlan(parsed, baseline, maxVariants);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallbackGeminiPlan(baseline, maxVariants, `Gemini plan fallback used: ${message}`);
  }
}

async function callToolSafe(
  client: Client,
  name: string,
  arguments_: Record<string, unknown>,
  options?: { timeout?: number; resetTimeoutOnProgress?: boolean }
): Promise<unknown> {
  try {
    return await client.callTool({ name, arguments: arguments_ }, undefined, options);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n");
  }
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const snippets: string[] = [];
  for (const key of ["text", "output", "error", "message"] as const) {
    if (typeof record[key] === "string" && record[key].trim()) {
      snippets.push(record[key]);
    }
  }
  for (const key of ["content", "structuredContent", "result"] as const) {
    if (key in record) {
      snippets.push(extractText(record[key]));
    }
  }
  if (snippets.length > 0) {
    return snippets.filter(Boolean).join("\n");
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseMetrics(performanceText: string, otherText = ""): MetricMap {
  // The Performance API reading is deterministic and measured the same way for every
  // run, so prefer it. Only scrape numbers out of free text when a value is genuinely
  // missing — the loose text regex is what produced "REQUESTS 1 -> 869".
  const perf = parsePerformanceJson(performanceText) ?? parsePerformanceJson(otherText);
  const combined = `${performanceText}\n\n${otherText}`;

  const lcp = perf?.lcp ?? firstMetric(combined, ["LCP", "Largest Contentful Paint"]);
  const cls = perf?.cls ?? firstMetric(combined, ["CLS", "Cumulative Layout Shift"]);
  const inp = firstMetric(combined, ["INP", "Interaction to Next Paint"]);
  const ttfb = perf?.ttfb ?? firstMetric(combined, ["TTFB", "Time to First Byte"]);
  const fcp = perf?.firstContentfulPaint ?? firstMetric(combined, ["FCP", "First Contentful Paint"]);
  const load = perf?.loadEventEnd && perf.loadEventEnd > 0 ? perf.loadEventEnd : undefined;
  const requestCount = perf?.resourceCount ?? firstCount(combined, ["resourceCount", "requestCount"]);

  return {
    lcp: lcp == null ? undefined : msMetric("LCP", lcp, rateLcp(lcp)),
    cls: cls == null ? undefined : unitlessMetric(cls, rateCls(cls)),
    inp: inp == null ? undefined : msMetric("INP", inp, rateInp(inp)),
    ttfb: ttfb == null ? undefined : msMetric("TTFB", ttfb, rateTtfb(ttfb)),
    fcp: fcp == null ? undefined : msMetric("FCP", fcp, rateFcp(fcp)),
    load: load == null ? undefined : msMetric("Load", load, load < 3000 ? "good" : load < 6000 ? "needs-improvement" : "poor"),
    requests: requestCount == null ? undefined : {
      value: requestCount,
      unit: "count",
      display: `${requestCount}`,
      rating: requestCount <= 50 ? "good" : requestCount <= 100 ? "needs-improvement" : "poor"
    }
  };
}

function firstMetric(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regexes = [
      new RegExp(`${escaped}[^0-9]{0,40}([0-9]+(?:\\.[0-9]+)?)\\s*(ms|s)?`, "i"),
      new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*(ms|s)\\s+${escaped}`, "i")
    ];
    for (const regex of regexes) {
      const match = text.match(regex);
      if (!match) {
        continue;
      }
      const value = Number.parseFloat(match[1]);
      const unit = match[2]?.toLowerCase();
      if (!Number.isFinite(value)) {
        continue;
      }
      return unit === "s" ? value * 1000 : value;
    }
  }
  return undefined;
}

function firstCount(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}[^0-9]{0,20}([0-9]+)`, "i"));
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }
  return undefined;
}

function parsePerformanceJson(text: string): {
  ttfb?: number;
  firstContentfulPaint?: number;
  lcp?: number;
  cls?: number;
  loadEventEnd?: number;
  resourceCount?: number;
} | undefined {
  const match = text.match(/\{[\s\S]*"navigation"[\s\S]*\}/);
  if (!match) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(match[0]) as any;
    return {
      ttfb: toNumber(parsed.navigation?.responseStart),
      firstContentfulPaint: toNumber(parsed.paints?.["first-contentful-paint"]),
      lcp: toNumber(parsed.lcp),
      cls: toNumber(parsed.cls),
      loadEventEnd: toNumber(parsed.navigation?.loadEventEnd),
      resourceCount: toNumber(parsed.resourceCount)
    };
  } catch {
    return undefined;
  }
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function msMetric(label: string, value: number, rating: Rating): MetricValue {
  return {
    value,
    unit: "ms",
    display: formatMs(label, value),
    rating
  };
}

function unitlessMetric(value: number, rating: Rating): MetricValue {
  return {
    value,
    unit: "",
    display: value.toFixed(3),
    rating
  };
}

function formatMs(_label: string, value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

function rateLcp(value: number): Rating {
  return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
}

function rateFcp(value: number): Rating {
  return value <= 1800 ? "good" : value <= 3000 ? "needs-improvement" : "poor";
}

function rateInp(value: number): Rating {
  return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
}

function rateTtfb(value: number): Rating {
  return value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
}

function rateCls(value: number): Rating {
  return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
}

function compareMetrics(before: MetricMap, after: MetricMap): VariantResult["deltas"] {
  const keys: Array<keyof MetricMap> = ["lcp", "cls", "inp", "ttfb", "fcp", "load", "requests"];
  return keys.flatMap((key) => {
    const beforeValue = before[key]?.value;
    const afterValue = after[key]?.value;
    if (beforeValue == null || afterValue == null) {
      return [];
    }
    const absoluteDelta = afterValue - beforeValue;
    const percentDelta = beforeValue === 0 ? undefined : (absoluteDelta / beforeValue) * 100;
    const direction = Math.abs(absoluteDelta) < 0.01
      ? "unchanged"
      : absoluteDelta < 0
        ? "improved"
        : "regressed";
    const label = key.toUpperCase();
    const displayDelta = percentDelta == null
      ? `${absoluteDelta > 0 ? "+" : ""}${absoluteDelta.toFixed(1)}`
      : `${percentDelta > 0 ? "+" : ""}${percentDelta.toFixed(1)}%`;
    return [{
      metric: label,
      before: beforeValue,
      after: afterValue,
      absoluteDelta,
      percentDelta,
      direction,
      display: `${label}: ${before[key]?.display ?? beforeValue} -> ${after[key]?.display ?? afterValue} (${displayDelta})`
    }];
  });
}

function summarizeVariant(plan: VariantPlan, deltas: VariantResult["deltas"]): string {
  const improved = deltas.filter((delta) => delta.direction === "improved").map((delta) => delta.metric);
  const regressed = deltas.filter((delta) => delta.direction === "regressed").map((delta) => delta.metric);
  if (improved.length === 0 && regressed.length === 0) {
    return `${plan.name} changed the visual presentation, but this run did not expose measurable metric movement. Review the screenshot for design impact.`;
  }
  return [
    `${plan.name} tested: ${plan.hypothesis}`,
    improved.length ? `Improved: ${improved.join(", ")}.` : "",
    regressed.length ? `Regressed: ${regressed.join(", ")}.` : ""
  ].filter(Boolean).join(" ");
}

function normalizeGeminiPlan(value: Partial<GeminiPlan>, baseline: RunResult, maxVariants: number): GeminiPlan {
  const fallback = fallbackGeminiPlan(baseline, maxVariants);
  const variations = Array.isArray(value.variations) && value.variations.length > 0
    ? value.variations.map(normalizeVariantPlan).filter(Boolean).slice(0, maxVariants) as VariantPlan[]
    : fallback.variations;

  return {
    summary: {
      headline: stringOr(value.summary?.headline, fallback.summary.headline),
      verdict: verdictOr(value.summary?.verdict, fallback.summary.verdict),
      narrative: stringOr(value.summary?.narrative, fallback.summary.narrative)
    },
    scores: value.scores ?? fallback.scores,
    analysis: {
      executiveSummary: stringOr(value.analysis?.executiveSummary, fallback.analysis.executiveSummary),
      frontendComparison: stringArrayOr(value.analysis?.frontendComparison, fallback.analysis.frontendComparison),
      performanceComparison: stringArrayOr(value.analysis?.performanceComparison, fallback.analysis.performanceComparison),
      goodEnough: stringArrayOr(value.analysis?.goodEnough, fallback.analysis.goodEnough),
      improveNext: stringArrayOr(value.analysis?.improveNext, fallback.analysis.improveNext),
      missingEvidence: stringArrayOr(value.analysis?.missingEvidence, fallback.analysis.missingEvidence)
    },
    issues: Array.isArray(value.issues) && value.issues.length > 0 ? value.issues.map(normalizeIssue) : fallback.issues,
    suggestions: Array.isArray(value.suggestions) && value.suggestions.length > 0 ? value.suggestions.map(normalizeSuggestion) : fallback.suggestions,
    variations
  };
}

function fallbackGeminiPlan(baseline: RunResult, maxVariants: number, note?: string): GeminiPlan {
  const metricNotes = Object.entries(baseline.metrics)
    .filter((entry): entry is [string, MetricValue] => Boolean(entry[1]))
    .map(([key, metric]) => `${key.toUpperCase()}: ${metric.display} (${metric.rating})`);

  return {
    summary: {
      headline: "Local Lighthouse and DevTools report",
      verdict: "needs-work",
      narrative: "The report was generated from Chrome DevTools MCP evidence. Gemini did not produce a complete custom plan, so Remedy used a conservative fallback variation set."
    },
    scores: {},
    analysis: {
      executiveSummary: "Review the metric cards, Lighthouse output, screenshots, and variant deltas to decide the next optimization target.",
      frontendComparison: ["The original screenshot is included for visual review."],
      performanceComparison: metricNotes.length ? metricNotes : ["No Core Web Vitals values were parsed from the available trace text."],
      goodEnough: [],
      improveNext: ["Run again with a stable network and fixed viewport, then prioritize issues with measurable Core Web Vitals movement."],
      missingEvidence: [note ?? "Custom Gemini analysis unavailable."]
    },
    issues: [
      {
        id: "issue-evidence-gap",
        title: "Structured analysis fallback",
        severity: "medium",
        category: "technical",
        description: "The local runner collected evidence but had to fall back to generic variations.",
        evidence: [note ?? "Gemini did not return a usable JSON plan."],
        recommendation: "Inspect the raw Lighthouse and trace notes, then rerun with a larger context/model if needed.",
        confidence: "medium"
      }
    ],
    suggestions: [
      {
        id: "suggestion-fixed-viewport",
        title: "Repeat with fixed viewport and compare against variants",
        priority: "medium",
        expectedImpact: "Improves confidence in visual and metric deltas.",
        recommendation: "Use --viewport, then compare original and variant screenshots before making code changes.",
        implementationNotes: "The generated HTML report already stores screenshots and metric deltas for this workflow.",
        confidence: "high",
        code: {
          language: "bash",
          after: "npm run dev -- --url \"<your-url>\" --html-report --viewport 1366x768 --max-variants 2"
        },
        comparison: {
          metric: "Run stability",
          before: "Variable viewport",
          after: "Fixed 1366x768 (est.)",
          summary: "A fixed viewport makes screenshot and metric comparisons repeatable between runs."
        }
      }
    ],
    variations: DEFAULT_VARIANTS.slice(0, maxVariants)
  };
}

function normalizeVariantPlan(value: Partial<VariantPlan> | undefined): VariantPlan | undefined {
  if (!value) {
    return undefined;
  }
  const id = safeId(value.id || value.name || "variant");
  return {
    id,
    name: stringOr(value.name, id),
    hypothesis: stringOr(value.hypothesis, "Test a safe visual improvement."),
    initScript: value.initScript ?? "",
    postLoadScript: value.postLoadScript ?? "",
    changes: Array.isArray(value.changes) ? value.changes.map((change) => ({
      type: change.type ?? "css",
      selector: change.selector,
      description: stringOr(change.description, "Visual mutation")
    })) : []
  };
}

function normalizeIssue(value: Partial<Issue>, index: number): Issue {
  return {
    id: safeId(value.id || `issue-${index + 1}`),
    title: stringOr(value.title, "Detected issue"),
    severity: severityOr(value.severity, "medium"),
    category: value.category ?? "technical",
    description: stringOr(value.description, ""),
    evidence: stringArrayOr(value.evidence, []),
    recommendation: stringOr(value.recommendation, ""),
    confidence: confidenceOr(value.confidence, "medium")
  };
}

function normalizeSuggestion(value: Partial<Suggestion>, index: number): Suggestion {
  return {
    id: safeId(value.id || `suggestion-${index + 1}`),
    title: stringOr(value.title, "Improvement suggestion"),
    priority: severityOr(value.priority, "medium"),
    expectedImpact: stringOr(value.expectedImpact, "Unknown"),
    recommendation: stringOr(value.recommendation, ""),
    implementationNotes: stringOr(value.implementationNotes, ""),
    confidence: confidenceOr(value.confidence, "medium"),
    code: normalizeSuggestionCode(value.code),
    comparison: normalizeSuggestionComparison(value.comparison)
  };
}

function normalizeSuggestionCode(value: SuggestionCode | undefined): SuggestionCode | undefined {
  const after = typeof value?.after === "string" ? value.after.trim() : "";
  if (!after) {
    return undefined;
  }
  return {
    language: typeof value?.language === "string" && value.language.trim() ? value.language.trim() : undefined,
    before: typeof value?.before === "string" && value.before.trim() ? value.before : undefined,
    after
  };
}

function normalizeSuggestionComparison(value: SuggestionComparison | undefined): SuggestionComparison | undefined {
  if (!value) {
    return undefined;
  }
  const comparison: SuggestionComparison = {
    metric: stringOrUndefined(value.metric),
    before: stringOrUndefined(value.before),
    after: stringOrUndefined(value.after),
    summary: stringOrUndefined(value.summary)
  };
  return comparison.metric || comparison.before || comparison.after || comparison.summary ? comparison : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function mergeScores(scores: GeminiPlan["scores"], baseline: RunResult): GeminiPlan["scores"] {
  const parsed = parseLighthouseScores(baseline.lighthouseText ?? "");
  return {
    performance: scores.performance ?? scoreFromMetrics(baseline.metrics),
    accessibility: scores.accessibility ?? parsed.accessibility,
    bestPractices: scores.bestPractices ?? parsed.bestPractices,
    seo: scores.seo ?? parsed.seo
  };
}

function parseLighthouseScores(text: string): GeminiPlan["scores"] {
  return {
    accessibility: parseScore(text, "Accessibility"),
    bestPractices: parseScore(text, "Best Practices"),
    seo: parseScore(text, "SEO")
  };
}

function parseScore(text: string, label: string): ScoreBlock | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}[^0-9]{0,30}([0-9]{1,3})`, "i"));
  if (!match) {
    return undefined;
  }
  const score = Math.min(100, Number.parseInt(match[1], 10));
  return {
    score,
    rating: score >= 90 ? "good" : score >= 50 ? "needs-improvement" : "poor"
  };
}

function scoreFromMetrics(metrics: MetricMap): ScoreBlock {
  const ratings = Object.values(metrics).filter(Boolean).map((metric) => metric.rating);
  if (ratings.length === 0) {
    return { rating: "unknown", summary: "Performance score requires trace-derived metric evidence." };
  }
  const score = Math.round(ratings.reduce((total, rating) => {
    if (rating === "good") return total + 100;
    if (rating === "needs-improvement") return total + 65;
    if (rating === "poor") return total + 30;
    return total + 50;
  }, 0) / ratings.length);
  return {
    score,
    rating: score >= 90 ? "good" : score >= 50 ? "needs-improvement" : "poor",
    summary: "Estimated from parsed DevTools trace and Performance API metrics, not Lighthouse performance."
  };
}

function pickBestVariant(variants: VariantResult[]): string | undefined {
  let best: { id: string; score: number } | undefined;
  for (const variant of variants) {
    const score = variant.deltas.reduce((total, delta) => {
      if (delta.direction === "improved") return total + Math.abs(delta.percentDelta ?? 1);
      if (delta.direction === "regressed") return total - Math.abs(delta.percentDelta ?? 1);
      return total;
    }, 0);
    if (!best || score > best.score) {
      best = { id: variant.id, score };
    }
  }
  return best?.id;
}

function renderHtml(report: StaticReport): string {
  const json = JSON.stringify(report).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Remedy Report - ${escapeHtml(report.url)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --panel: #ffffff;
      --ink: #172033;
      --muted: #667085;
      --line: #d9deea;
      --good: #15803d;
      --good-bg: #e8f7ee;
      --warn: #a16207;
      --warn-bg: #fff7d6;
      --poor: #b42318;
      --poor-bg: #fee4e2;
      --accent: #2458d3;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
    header { display: grid; gap: 10px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 46px); line-height: 1.05; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 22px; letter-spacing: 0; }
    h3 { margin: 0 0 10px; font-size: 17px; letter-spacing: 0; }
    p { margin: 0; line-height: 1.55; }
    a { color: var(--accent); }
    .url { color: var(--muted); overflow-wrap: anywhere; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 14px; }
    .pill { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); font-size: 13px; font-weight: 650; }
    .pill.good, .delta.improved { color: var(--good); background: var(--good-bg); border-color: #bbebcc; }
    .pill.needs-improvement { color: var(--warn); background: var(--warn-bg); border-color: #f3df8a; }
    .pill.poor, .pill.fail, .delta.regressed { color: var(--poor); background: var(--poor-bg); border-color: #f6b7b3; }
    .pill.unknown, .delta.unchanged, .delta.unknown { color: var(--muted); background: #eef1f6; border-color: var(--line); }
    section { margin-top: 20px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; box-shadow: 0 1px 2px rgba(16,24,40,.04); }
    .grid { display: grid; gap: 14px; }
    .score-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .metric-grid { grid-template-columns: repeat(7, minmax(130px, 1fr)); overflow-x: auto; }
    .card-title { color: var(--muted); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
    .score, .metric-value { margin-top: 8px; font-size: 30px; font-weight: 780; letter-spacing: 0; }
    .muted { color: var(--muted); }
    .screens { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    figure { margin: 0; }
    figcaption { margin-bottom: 8px; font-weight: 700; color: var(--muted); font-size: 14px; }
    img { display: block; width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--line); background: #eef1f6; }
    .list { display: grid; gap: 10px; }
    .item { border-top: 1px solid var(--line); padding-top: 12px; }
    .item:first-child { border-top: 0; padding-top: 0; }
    .item-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; justify-content: space-between; }
    ul { margin: 8px 0 0; padding-left: 20px; }
    li { margin: 4px 0; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .delta { display: inline-flex; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--line); font-weight: 700; font-size: 12px; }
    details { border-top: 1px solid var(--line); padding: 12px 0; }
    details:first-child { border-top: 0; }
    summary { cursor: pointer; font-weight: 750; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f1f4f9; border: 1px solid var(--line); border-radius: 6px; padding: 12px; max-height: 260px; overflow: auto; }
    .code { margin-top: 12px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: #0b1020; }
    .code-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #131a2e; }
    .code-lang { color: #9aa4b2; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
    .copy { cursor: pointer; border: 1px solid #2c3a5e; background: #1d2742; color: #dbe4f5; border-radius: 6px; padding: 4px 12px; font-size: 12px; font-weight: 650; }
    .copy:hover { background: #27345a; }
    .code .code-tag { color: #9aa4b2; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; padding: 8px 12px 0; }
    .code pre { margin: 8px 12px 12px; background: #0b1020; color: #e6edf6; border: 0; border-radius: 6px; padding: 12px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .code pre.before { color: #f1a8a3; }
    .cmp { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .cmp-cell { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; background: var(--bg); }
    .cmp-label { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
    .cmp-val { display: block; margin-top: 4px; font-weight: 700; font-size: 15px; }
    .cmp-cell:last-child .cmp-val { color: var(--good); }
    @media (max-width: 640px) { .cmp { grid-template-columns: 1fr; } }
    @media (max-width: 900px) {
      .score-grid, .metric-grid, .screens { grid-template-columns: 1fr; }
      main { padding: 22px 14px 40px; }
    }
  </style>
</head>
<body>
  <main id="app"></main>
  <script id="report-data" type="application/json">${json}</script>
  <script>
    const report = JSON.parse(document.getElementById("report-data").textContent);
    const app = document.getElementById("app");
    function copyCode(btn) {
      const wrap = btn.closest(".code");
      const pre = wrap && (wrap.querySelector("[data-copy]") || wrap.querySelector("pre"));
      if (!pre) return;
      const done = () => { const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = t; }, 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pre.textContent).then(done).catch(() => {});
      } else {
        const r = document.createRange(); r.selectNode(pre);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        try { document.execCommand("copy"); done(); } catch (e) {}
        sel.removeAllRanges();
      }
    }
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    const pill = (label, tone = "unknown") => '<span class="pill ' + esc(tone) + '">' + esc(label) + '</span>';
    const metricCard = ([key, metric]) => metric ? '<div class="panel"><div class="card-title">' + esc(key.toUpperCase()) + '</div><div class="metric-value">' + esc(metric.display) + '</div>' + pill(metric.rating, metric.rating) + '</div>' : "";
    const scoreCard = (label, score) => '<div class="panel"><div class="card-title">' + esc(label) + '</div><div class="score">' + esc(score?.score ?? "N/A") + '</div>' + pill(score?.rating ?? "unknown", score?.rating ?? "unknown") + (score?.summary ? '<p class="muted">' + esc(score.summary) + '</p>' : '') + '</div>';
    const list = (items) => items?.length ? '<ul>' + items.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>' : '<p class="muted">No items recorded.</p>';
    const imgFigure = (label, src) => src ? '<figure><figcaption>' + esc(label) + '</figcaption><img src="' + esc(src) + '" alt="' + esc(label) + ' screenshot" /></figure>' : '<div class="panel muted">No screenshot captured for ' + esc(label) + '.</div>';
    const best = report.variations.find((variant) => variant.id === report.summary.bestVariationId) ?? report.variations[0];
    const scoreRows = [
      scoreCard("Performance", report.scores.performance),
      scoreCard("Accessibility", report.scores.accessibility),
      scoreCard("Best Practices", report.scores.bestPractices),
      scoreCard("SEO", report.scores.seo)
    ].join('');
    const metricRows = Object.entries(report.baseline.metrics).map(metricCard).join('');
    const issueRows = report.issues.map((issue) => '<div class="item"><div class="item-head"><h3>' + esc(issue.title) + '</h3>' + pill(issue.severity, issue.severity === "critical" ? "poor" : issue.severity) + '</div><p>' + esc(issue.description) + '</p>' + list(issue.evidence) + '<p><strong>Recommendation:</strong> ' + esc(issue.recommendation) + '</p></div>').join('');
    const codeBlock = (code) => {
      if (!code || !code.after) return '';
      const lang = code.language ? esc(code.language) : 'code';
      let html = '<div class="code"><div class="code-head"><span class="code-lang">' + lang + '</span><button class="copy" type="button" onclick="copyCode(this)">Copy</button></div>';
      if (code.before) {
        html += '<div class="code-tag">Before</div><pre class="before">' + esc(code.before) + '</pre>';
        html += '<div class="code-tag">After</div>';
      }
      html += '<pre data-copy>' + esc(code.after) + '</pre></div>';
      return html;
    };
    const comparisonBlock = (c) => {
      if (!c || (!c.before && !c.after && !c.metric)) return '';
      const rows = [['Metric', esc(c.metric || 'Expected')], ['Before', esc(c.before || '—')], ['After (expected)', esc(c.after || '—')]];
      return '<div class="cmp">' + rows.map((r) => '<div class="cmp-cell"><span class="cmp-label">' + r[0] + '</span><span class="cmp-val">' + r[1] + '</span></div>').join('') + '</div>' + (c.summary ? '<p class="muted" style="margin-top:6px">' + esc(c.summary) + '</p>' : '');
    };
    const suggestionRows = report.suggestions.map((suggestion) => '<div class="item"><div class="item-head"><h3>' + esc(suggestion.title) + '</h3>' + pill(suggestion.priority, suggestion.priority === "critical" ? "poor" : suggestion.priority) + '</div><p><strong>Expected impact:</strong> ' + esc(suggestion.expectedImpact) + '</p><p>' + esc(suggestion.recommendation) + '</p>' + (suggestion.implementationNotes ? '<p class="muted">' + esc(suggestion.implementationNotes) + '</p>' : '') + comparisonBlock(suggestion.comparison) + codeBlock(suggestion.code) + '</div>').join('');
    const deltaRows = report.variations.map((variant) => '<tr><td><strong>' + esc(variant.label) + '</strong><br><span class="muted">' + esc(variant.hypothesis) + '</span></td><td>' + variant.deltas.map((delta) => '<span class="delta ' + esc(delta.direction) + '">' + esc(delta.display) + '</span>').join(' ') + '</td><td>' + esc(variant.analysis) + '</td></tr>').join('');
    const variationDetails = report.variations.map((variant) => '<details><summary>' + esc(variant.label) + '</summary><div class="screens" style="margin-top:12px">' + imgFigure("Original", report.baseline.screenshot) + imgFigure(variant.label, variant.screenshot) + '</div><h3 style="margin-top:14px">Applied Changes</h3>' + list(variant.changes.map((change) => change.description + (change.selector ? " (" + change.selector + ")" : ""))) + '</details>').join('');
    app.innerHTML = \`
      <header>
        <div class="meta">\${pill(report.summary.verdict, report.summary.verdict === "pass" ? "good" : report.summary.verdict === "fail" ? "poor" : "needs-improvement")}\${pill(report.tool.viewport)}\${pill(new Date(report.createdAt).toLocaleString())}</div>
        <h1>\${esc(report.summary.headline)}</h1>
        <p class="url">\${esc(report.url)}</p>
        <p>\${esc(report.summary.narrative)}</p>
      </header>
      <section class="grid score-grid">\${scoreRows}</section>
      <section><h2>Core Metrics</h2><div class="grid metric-grid">\${metricRows || '<div class="panel muted">No metrics parsed from this run.</div>'}</div></section>
      <section class="panel"><h2>Original vs Best Variation</h2><p class="muted" style="margin-bottom:12px">Each screenshot includes a Core Web Vitals overlay so you can compare measured metrics alongside the visual result.</p><div class="screens">\${imgFigure("Original", report.baseline.screenshot)}\${imgFigure(best?.label ?? "Variation", best?.screenshot)}</div></section>
      <section class="panel"><h2>Metric Deltas</h2><table><thead><tr><th>Variation</th><th>Deltas</th><th>Analysis</th></tr></thead><tbody>\${deltaRows || '<tr><td colspan="3">No variations tested.</td></tr>'}</tbody></table></section>
      <section class="panel"><h2>Detected Issues</h2><div class="list">\${issueRows || '<p class="muted">No issues returned.</p>'}</div></section>
      <section class="panel"><h2>Suggestions</h2><div class="list">\${suggestionRows || '<p class="muted">No suggestions returned.</p>'}</div></section>
      <section class="panel"><h2>Analysis</h2><h3>Frontend Comparison</h3>\${list(report.analysis.frontendComparison)}<h3>Performance Comparison</h3>\${list(report.analysis.performanceComparison)}<h3>Good Enough</h3>\${list(report.analysis.goodEnough)}<h3>Improve Next</h3>\${list(report.analysis.improveNext)}<h3>Missing Evidence</h3>\${list(report.analysis.missingEvidence)}</section>
      <section class="panel"><h2>Variation Details</h2>\${variationDetails || '<p class="muted">No variation details.</p>'}</section>
      <section class="panel"><h2>Evidence Appendix</h2><details><summary>Lighthouse</summary><pre>\${esc(report.evidence.lighthouseNotes.join("\\n"))}</pre></details><details><summary>Trace</summary><pre>\${esc(report.evidence.traceNotes.join("\\n"))}</pre></details><details><summary>Network</summary><pre>\${esc(report.evidence.networkNotes.join("\\n"))}</pre></details><details><summary>Console</summary><pre>\${esc(report.evidence.consoleNotes.join("\\n"))}</pre></details></section>
    \`;
  </script>
</body>
</html>
`;
}

function performanceEntryScript(): string {
  return `() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, Math.round(entry.startTime)]));
    let lcp;
    try {
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
      const lcpEntry = lcpEntries[lcpEntries.length - 1];
      if (lcpEntry) {
        lcp = Math.round(lcpEntry.renderTime || lcpEntry.startTime);
      }
    } catch (e) {}
    let cls;
    try {
      cls = 0;
      for (const entry of performance.getEntriesByType("layout-shift")) {
        if (!entry.hadRecentInput) {
          cls += entry.value;
        }
      }
      cls = Math.round(cls * 1000) / 1000;
    } catch (e) {}
    return {
      navigation: navigation ? {
        startTime: Math.round(navigation.startTime),
        requestStart: Math.round(navigation.requestStart),
        responseStart: Math.round(navigation.responseStart),
        responseEnd: Math.round(navigation.responseEnd),
        domContentLoadedEventEnd: Math.round(navigation.domContentLoadedEventEnd),
        loadEventEnd: Math.round(navigation.loadEventEnd),
        transferSize: navigation.transferSize,
        encodedBodySize: navigation.encodedBodySize
      } : null,
      paints,
      lcp,
      cls,
      resourceCount: performance.getEntriesByType("resource").length
    };
  }`;
}

function wrapScriptAsFunction(script: string): string {
  return `() => {
    try {
      ${script}
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error && error.message ? error.message : error) };
    }
  }`;
}

// Builds an evaluate_script function that paints a fixed DevTools-style Core Web Vitals
// panel onto the page, so take_screenshot captures the numbers rather than a blank diff.
function statsOverlayScript(metrics: MetricMap, label: string): string {
  const order: Array<keyof MetricMap> = ["lcp", "fcp", "cls", "inp", "ttfb", "load", "requests"];
  const rows = order
    .map((key) => {
      const metric = metrics[key];
      return metric ? { label: String(key).toUpperCase(), display: metric.display, rating: metric.rating } : null;
    })
    .filter(Boolean);
  const payload = JSON.stringify({ title: label, rows });
  return `() => {
    const data = ${payload};
    document.querySelectorAll('[data-remedy-stats]').forEach((el) => el.remove());
    const colors = { good: '#15803d', 'needs-improvement': '#a16207', poor: '#b42318', unknown: '#94a3b8' };
    const panel = document.createElement('div');
    panel.setAttribute('data-remedy-stats', 'true');
    panel.style.cssText = 'position:fixed;top:16px;left:16px;z-index:2147483647;background:#0b1020;color:#f6f7fb;font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;border-radius:10px;padding:14px 16px;box-shadow:0 10px 34px rgba(0,0,0,.45);min-width:240px;max-width:360px;';
    const head = document.createElement('div');
    head.textContent = 'Core Web Vitals \\u2014 ' + data.title;
    head.style.cssText = 'font-weight:700;margin-bottom:10px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#9aa4b2;';
    panel.appendChild(head);
    if (!data.rows.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No metrics parsed from this run.';
      empty.style.color = '#9aa4b2';
      panel.appendChild(empty);
    } else {
      data.rows.forEach((row) => {
        const line = document.createElement('div');
        line.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:18px;padding:4px 0;';
        const name = document.createElement('span');
        name.textContent = row.label;
        name.style.color = '#cbd5e1';
        const value = document.createElement('span');
        value.textContent = row.display;
        value.style.cssText = 'font-weight:700;color:' + (colors[row.rating] || colors.unknown) + ';';
        line.appendChild(name);
        line.appendChild(value);
        panel.appendChild(line);
      });
    }
    (document.body || document.documentElement).appendChild(panel);
    return { ok: true, rows: data.rows.length };
  }`;
}

function genericMutationScript(body: string): string {
  return `(() => {
    const apply = () => {
      ${body}
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", apply, { once: true });
    } else {
      apply();
    }
  })();`;
}

function extractGeminiText(response: any): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text)
    .filter((partText: unknown): partText is string => typeof partText === "string")
    .join("")
    .trim();
  if (!text) {
    throw new Error("Gemini returned no text JSON.");
  }
  return text;
}

function truncateForPrompt(value: string | undefined): string {
  if (!value) {
    return "(none)";
  }
  return value.length > 12000 ? `${value.slice(0, 12000)}\n[truncated ${value.length - 12000} chars]` : value;
}

function topLines(value: string | undefined, count: number): string[] {
  if (!value) {
    return [];
  }
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, count);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallback;
}

function verdictOr(value: unknown, fallback: GeminiPlan["summary"]["verdict"]): GeminiPlan["summary"]["verdict"] {
  return value === "pass" || value === "needs-work" || value === "fail" ? value : fallback;
}

function severityOr(value: unknown, fallback: Severity): Severity {
  return value === "critical" || value === "high" || value === "medium" || value === "low" ? value : fallback;
}

function confidenceOr(value: unknown, fallback: "high" | "medium" | "low"): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low" ? value : fallback;
}

function normalizeViewport(value: string): string {
  return /^\d+x\d+x\d+/.test(value) ? value : `${value}x1`;
}

function createReportId(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safeId(host)}-${stamp}`;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "report";
}

function toReportPath(outputDir: string, filePath: string): string {
  return relative(outputDir, filePath).replace(/\\/g, "/");
}

function fileIfExists(outputDir: string, filePath: string): string | undefined {
  const candidates = [
    filePath,
    filePath.endsWith(".json.gz") ? filePath.replace(/\.json\.gz$/, ".json.json.gz") : ""
  ].filter(Boolean);
  const match = candidates.find((candidate) => existsSync(candidate));
  return match ? toReportPath(outputDir, match) : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] ?? char));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
