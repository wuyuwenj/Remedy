#!/usr/bin/env node
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  mcpToTool,
  type Content,
  type FunctionCall,
  type FunctionResponse,
  type GenerateContentResponse,
  type Part
} from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateLocalHtmlReport } from "./local-report.js";

type CliOptions = {
  url?: string;
  prompt?: string;
  model: string;
  maxToolCalls: number;
  headless: boolean;
  isolated: boolean;
  usageStatistics: boolean;
  performanceCrux: boolean;
  viewport?: string;
  browserUrl?: string;
  htmlReport: boolean;
  reportDir?: string;
  maxVariants: number;
};

const MAX_PART_PREVIEW_CHARS = 6000;

function loadEnvFile(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function defaultModel(): string {
  return process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    model: defaultModel(),
    maxToolCalls: 8,
    headless: true,
    isolated: true,
    usageStatistics: false,
    performanceCrux: false,
    htmlReport: false,
    maxVariants: 2
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      case "--url":
      case "-u":
        options.url = requireValue(arg, next);
        i += 1;
        break;
      case "--prompt":
      case "-p":
        options.prompt = requireValue(arg, next);
        i += 1;
        break;
      case "--model":
      case "-m":
        options.model = requireValue(arg, next);
        i += 1;
        break;
      case "--max-tool-calls":
        options.maxToolCalls = parsePositiveInteger(arg, requireValue(arg, next));
        i += 1;
        break;
      case "--browser-url":
        options.browserUrl = requireValue(arg, next);
        i += 1;
        break;
      case "--viewport":
        options.viewport = requireValue(arg, next);
        i += 1;
        break;
      case "--html-report":
        options.htmlReport = true;
        break;
      case "--report-dir":
        options.reportDir = requireValue(arg, next);
        i += 1;
        break;
      case "--max-variants":
        options.maxVariants = parsePositiveInteger(arg, requireValue(arg, next));
        i += 1;
        break;
      case "--headed":
        options.headless = false;
        break;
      case "--shared-profile":
        options.isolated = false;
        break;
      case "--usage-statistics":
        options.usageStatistics = true;
        break;
      case "--performance-crux":
        options.performanceCrux = true;
        break;
      default:
        if (!options.url && !arg.startsWith("-")) {
          options.url = arg;
          break;
        }

        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function printHelp(): void {
  console.log(`
Usage:
  npm run dev -- --url https://example.com
  npm run dev -- https://example.com --prompt "Focus on LCP and render blocking resources"

Options:
  -u, --url <url>           Website to inspect.
  -p, --prompt <text>       Extra instruction for Gemini.
  -m, --model <model>       Gemini model. Defaults to ${defaultModel()}.
      --browser-url <url>   Connect MCP to an existing debuggable Chrome, e.g. http://127.0.0.1:9222.
      --viewport <size>     Initial Chrome viewport, e.g. 390x844.
      --max-tool-calls <n>   Max Gemini->MCP calls before finalizing. Defaults to 8.
      --html-report          Generate a local static HTML report with Lighthouse, trace, screenshots, and variants.
      --report-dir <path>    Directory for local HTML report output. Defaults to reports/<site>-<timestamp>.
      --max-variants <n>     Number of visual variants to generate/test in --html-report mode. Defaults to 2.
      --headed              Show Chrome instead of running headless.
      --shared-profile      Reuse Chrome DevTools MCP's default profile instead of a temporary profile.
      --usage-statistics    Allow Chrome DevTools MCP usage statistics.
      --performance-crux    Allow performance traces to request CrUX field data.
  -h, --help                Show this help.
`);
}

function parsePositiveInteger(flag: string, value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }

  return parsed;
}

function normalizeUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    throw new Error("Pass a URL as the first argument or with --url.");
  }

  const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const parsed = new URL(withProtocol);
  return parsed.toString();
}

function buildMcpArgs(options: CliOptions): string[] {
  const args = [
    "-y",
    "chrome-devtools-mcp@latest",
    "--redactNetworkHeaders=true"
  ];

  if (options.headless) {
    args.push("--headless");
  }

  if (options.isolated) {
    args.push("--isolated");
  }

  args.push(options.usageStatistics ? "--usageStatistics" : "--no-usage-statistics");
  args.push(options.performanceCrux ? "--performanceCrux" : "--no-performance-crux");

  if (options.viewport) {
    args.push(`--viewport=${options.viewport}`);
  }

  if (options.browserUrl) {
    args.push(`--browserUrl=${options.browserUrl}`);
  }

  return args;
}

function buildChildEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  env.npm_config_cache = resolve(process.cwd(), ".npm-cache");
  return env;
}

function buildPrompt(url: string, extraPrompt: string | undefined): string {
  return `
You are Site Doctor, an autonomous frontend and web performance evaluator for a hackathon demo.

Target URL: ${url}

Use Chrome DevTools MCP tools to inspect the target site and compare the current frontend against a fast, production-ready baseline. Prefer this sequence:
1. Navigate to the target URL and wait for the page to settle.
2. Capture a snapshot or screenshot and identify the actual page, viewport, primary content, and any broken or hidden UI.
3. Inspect console output for errors, hydration/runtime failures, blocked resources, and noisy warnings.
4. Inspect network activity for document status, render-blocking CSS/JS, image/font weight, duplicate requests, failed requests, caching signals, and third-party scripts.
5. Run a performance trace with reload and auto-stop. Use trace insights before guessing.
6. If a mobile viewport or Lighthouse is available and useful, use it to sharpen the comparison; otherwise state that it was unavailable.

Return a concise Markdown report with these sections:
1. Verdict: one paragraph comparing the current experience with the expected fast baseline.
2. Evidence table: Area, Current evidence, Fast-baseline expectation, Delta, Priority. Cover rendering/UX, JavaScript/main thread, network/assets, Core Web Vitals proxies, console reliability, and accessibility basics when observed.
3. Frontend comparison: specific UI or implementation gaps visible from the page and DevTools evidence.
4. Performance comparison: trace/network-backed findings, with metric names and values only when observed.
5. Top fixes: the 3 highest-impact changes, each with expected user impact, likely implementation direction, and how to verify.
6. Follow-up checks this CLI should run next.

Do not invent metrics, tools, files, or framework details. If a metric or comparison point is unavailable, say what evidence is missing and what available evidence suggests.
Do not sign into sites, enter credentials, accept purchases, or make destructive changes.

${extraPrompt ? `Additional user instruction: ${extraPrompt}` : ""}
`.trim();
}

function extractFinalText(response: GenerateContentResponse): string | undefined {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((partText): partText is string => Boolean(partText))
    .join("")
    .trim();

  return text || undefined;
}

function formatGeminiResponse(response: GenerateContentResponse): string {
  const text = extractFinalText(response);
  const finalParts = response.candidates?.[0]?.content?.parts ?? [];
  const nonTextFinalParts = formatParts(finalParts, false);

  if (text && nonTextFinalParts.length === 0) {
    return text;
  }

  const sections: string[] = [];

  if (text) {
    sections.push(text);
  }

  if (text && nonTextFinalParts.length > 0) {
    sections.push(["## Gemini non-text response parts", ...nonTextFinalParts].join("\n\n"));
  }

  if (!text) {
    const renderedCandidates = renderCandidateParts(response);
    if (renderedCandidates.length > 0) {
      sections.push(["## Gemini response parts", ...renderedCandidates].join("\n\n"));
    }

    const renderedHistory = renderFunctionCallingHistory(response.automaticFunctionCallingHistory);
    if (renderedHistory.length > 0) {
      sections.push(["## Gemini tool-call history", ...renderedHistory].join("\n\n"));
    }
  }

  if (sections.length > 0) {
    return sections.join("\n\n---\n\n");
  }

  return "No response text or inspectable response parts returned by Gemini.";
}

function buildFinalReportPrompt(url: string): string {
  return `
You have already collected Chrome DevTools MCP evidence for this Site Doctor run.

Target URL: ${url}

Now produce the final user-facing report using only the evidence already in this conversation.
Do not request or call more tools.

Return Markdown with these sections:
1. Verdict
2. Evidence table
3. Frontend comparison
4. Performance comparison
5. Top fixes
6. Good enough
7. Follow-up checks

In "Top fixes", name the exact page element, resource group, or implementation area, include observed evidence, expected impact, likely implementation, and confidence.
In "Good enough", explicitly identify what appears acceptable so the report has a comparison instead of only a bug list.
If a trace file was produced, briefly explain that it is the raw compressed Chrome performance trace used for deeper analysis.
`.trim();
}

async function finalizeReportFromToolHistory(
  ai: GoogleGenAI,
  model: string,
  targetUrl: string,
  response: GenerateContentResponse
): Promise<string | undefined> {
  const history = response.automaticFunctionCallingHistory;
  if (!history || history.length === 0) {
    return undefined;
  }

  console.error("[remedy] Gemini finished on tool parts; asking for a final report-only pass.");
  const finalResponse = await ai.models.generateContent({
    model,
    contents: [
      ...history,
      {
        role: "user",
        parts: [{ text: buildFinalReportPrompt(targetUrl) }]
      } satisfies Content
    ],
    config: {
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.NONE
        }
      }
    }
  });

  return extractFinalText(finalResponse);
}

function renderCandidateParts(response: GenerateContentResponse): string[] {
  return (response.candidates ?? []).flatMap((candidate, candidateIndex) => {
    const parts = formatParts(candidate.content?.parts ?? [], true);
    if (parts.length === 0) {
      return [];
    }

    const label = response.candidates && response.candidates.length > 1
      ? `### Candidate ${candidate.index ?? candidateIndex}`
      : "### Candidate";

    return [[label, ...parts].join("\n\n")];
  });
}

function renderFunctionCallingHistory(history: Content[] | undefined): string[] {
  return (history ?? []).flatMap((content, contentIndex) => {
    const parts = formatParts(content.parts ?? [], true);
    if (parts.length === 0) {
      return [];
    }

    const role = content.role ? ` ${content.role}` : "";
    return [[`### Turn ${contentIndex + 1}${role}`, ...parts].join("\n\n")];
  });
}

function formatParts(parts: Part[], includeText: boolean): string[] {
  return parts.flatMap((part, index) => {
    const rendered = formatPart(part, includeText);
    return rendered ? [`#### Part ${index + 1}\n\n${rendered}`] : [];
  });
}

function formatPart(part: Part, includeText: boolean): string | undefined {
  if (part.thought) {
    return undefined;
  }

  if (includeText && part.text?.trim()) {
    return part.text.trim();
  }

  if (part.functionCall) {
    return formatFunctionCall(part.functionCall);
  }

  if (part.functionResponse) {
    return formatFunctionResponse(part.functionResponse);
  }

  if (part.executableCode) {
    return [
      "Executable code:",
      "```json",
      stringifyPreview(part.executableCode),
      "```"
    ].join("\n");
  }

  if (part.codeExecutionResult) {
    return [
      "Code execution result:",
      "```json",
      stringifyPreview(part.codeExecutionResult),
      "```"
    ].join("\n");
  }

  if (part.fileData) {
    return [
      "File data:",
      "```json",
      stringifyPreview(part.fileData),
      "```"
    ].join("\n");
  }

  if (part.inlineData) {
    return `Inline data returned (${part.inlineData.mimeType ?? "unknown MIME type"}).`;
  }

  if (part.toolCall) {
    return [
      "Tool call:",
      "```json",
      stringifyPreview(part.toolCall),
      "```"
    ].join("\n");
  }

  if (part.toolResponse) {
    return [
      "Tool response:",
      "```json",
      stringifyPreview(part.toolResponse),
      "```"
    ].join("\n");
  }

  return undefined;
}

function formatFunctionCall(functionCall: FunctionCall): string {
  return [
    `Function call: ${functionCall.name ?? "(unnamed)"}`,
    "```json",
    stringifyPreview({
      id: functionCall.id,
      args: functionCall.args,
      partialArgs: functionCall.partialArgs,
      willContinue: functionCall.willContinue
    }),
    "```"
  ].join("\n");
}

function formatFunctionResponse(functionResponse: FunctionResponse): string {
  const snippets = extractResponseText(functionResponse.response);
  const body = snippets.length > 0
    ? truncate(snippets.join("\n\n"))
    : ["```json", stringifyPreview(functionResponse.response), "```"].join("\n");

  return [
    `Function response: ${functionResponse.name ?? "(unnamed)"}`,
    body
  ].join("\n\n");
}

function extractResponseText(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(extractResponseText);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const snippets: string[] = [];

  for (const key of ["text", "output", "error"] as const) {
    const field = record[key];
    if (typeof field === "string" && field.trim()) {
      snippets.push(field.trim());
    }
  }

  for (const key of ["content", "structuredContent"] as const) {
    if (key in record) {
      snippets.push(...extractResponseText(record[key]));
    }
  }

  return snippets;
}

function stringifyPreview(value: unknown): string {
  let serialized: string;

  try {
    serialized = JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    serialized = String(value);
  }

  return truncate(serialized);
}

function truncate(value: string): string {
  if (value.length <= MAX_PART_PREVIEW_CHARS) {
    return value;
  }

  const omitted = value.length - MAX_PART_PREVIEW_CHARS;
  return `${value.slice(0, MAX_PART_PREVIEW_CHARS)}\n\n[truncated ${omitted} characters]`;
}

async function main(): Promise<void> {
  loadEnvFile();
  const options = parseArgs(process.argv.slice(2));
  const targetUrl = normalizeUrl(options.url);

  // Default the report workflow to a landscape viewport so screenshots are wide and
  // zoomed to the above-the-fold area instead of a tall full-page capture.
  if (options.htmlReport && !options.viewport) {
    options.viewport = "1366x768";
  }

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Set GEMINI_API_KEY or GOOGLE_API_KEY before running the CLI.");
  }

  const mcpArgs = buildMcpArgs(options);
  const transport = new StdioClientTransport({
    command: "npx",
    args: mcpArgs,
    env: buildChildEnv()
  });
  const mcpClient = new Client({
    name: "remedy-site-doctor-cli",
    version: "0.1.0"
  });

  const ai = new GoogleGenAI({ apiKey });

  console.error(`[remedy] Starting Chrome DevTools MCP: npx ${mcpArgs.join(" ")}`);
  await mcpClient.connect(transport);

  try {
    if (options.htmlReport) {
      console.error("[remedy] Running deterministic Lighthouse + trace + screenshot report workflow");
      const result = await generateLocalHtmlReport({
        client: mcpClient,
        ai,
        model: options.model,
        targetUrl,
        outputDir: options.reportDir,
        viewport: options.viewport,
        maxVariants: options.maxVariants
      });
      console.log(`Local HTML report written to ${result.htmlPath}`);
      console.log(`Report JSON written to ${result.jsonPath}`);
      console.log(`Artifacts directory: ${result.outputDir}`);
      return;
    }

    console.error(`[remedy] Asking ${options.model} to evaluate ${targetUrl}`);
    const response = await ai.models.generateContent({
      model: options.model,
      contents: buildPrompt(targetUrl, options.prompt),
      config: {
        automaticFunctionCalling: {
          maximumRemoteCalls: options.maxToolCalls
        },
        tools: [mcpToTool(mcpClient)]
      }
    });

    const report = extractFinalText(response) ?? await finalizeReportFromToolHistory(ai, options.model, targetUrl, response);
    console.log(report ?? formatGeminiResponse(response));
  } finally {
    await mcpClient.close();
  }
}

function flushStdout(): Promise<void> {
  return new Promise((resolveFlush) => {
    if (process.stdout.writableLength === 0) {
      resolveFlush();
      return;
    }
    process.stdout.once("drain", () => resolveFlush());
  });
}

main()
  .then(async () => {
    // The Chrome DevTools MCP child process keeps the event loop alive even after
    // mcpClient.close(), so exit explicitly. Flush first so piped output isn't truncated.
    await flushStdout();
    console.error("[remedy] Done. ✅");
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[remedy] ${message}`);
    process.exit(1);
  });
