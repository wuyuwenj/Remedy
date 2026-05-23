import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

function buildChildEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
  const cwdParts = process.cwd().split(/[\\/]/);
  const cacheRoot = cwdParts[cwdParts.length - 1] === 'server' ? '..' : '.';
  env.npm_config_cache = resolve(process.cwd(), cacheRoot, '.npm-cache');
  return env;
}

type ToolLogger = (toolName: string, args: Record<string, unknown>) => void;

let _onToolCall: ToolLogger | null = null;

export function setToolCallLogger(logger: ToolLogger): void {
  _onToolCall = logger;
}

function resultText(result: any): string {
  if (Array.isArray(result?.content)) {
    return result.content
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c.text)
      .join(' ');
  }
  return typeof result?.content === 'string' ? result.content : '';
}

// Calls an MCP tool: notifies the registered UI logger (for in-app status), then
// runs it with console timing + error logging so backend progress is visible.
async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>
): Promise<any> {
  if (_onToolCall) _onToolCall(name, args);
  console.log(`[MCP] → ${name} ${JSON.stringify(args).slice(0, 160)}`);
  const start = Date.now();
  const result: any = await client.callTool({ name, arguments: args });
  const ms = Date.now() - start;
  const text = resultText(result);
  // navigate failures come back as a result (isError or "Error: ..." text), not a throw
  const looksError = result?.isError === true || /^\s*Error[:\s]/i.test(text);
  if (looksError) {
    console.warn(`[MCP] ✗ ${name} failed in ${ms}ms — ${text.slice(0, 300)}`);
  } else {
    console.log(`[MCP] ✓ ${name} in ${ms}ms (${text.length} chars)`);
  }
  return result;
}

export async function createMcpClient(): Promise<Client> {
  const mcpPackage = process.env.CHROME_DEVTOOLS_MCP_PACKAGE ?? 'chrome-devtools-mcp@latest';
  const transport = new StdioClientTransport({
    command: 'npx',
    args: [
      '-y',
      mcpPackage,
      '--headless',
      '--isolated',
      '--no-usage-statistics',
      '--no-performance-crux',
      '--redactNetworkHeaders=true',
    ],
    env: buildChildEnv(),
  });

  const client = new Client({
    name: 'remedy-agent',
    version: '1.0.0',
  });

  await client.connect(transport);
  console.log('[MCP] Connected to chrome-devtools-mcp');

  return client;
}

const TRACE_NAV_TIMEOUT_MS = process.env.TRACE_NAV_TIMEOUT_MS
  ? parseInt(process.env.TRACE_NAV_TIMEOUT_MS, 10)
  : 25_000;
const TRACE_SETTLE_MS = 3_000;

// Captures a performance trace for `url`. We drive the page load ourselves
// (start trace without reload, then navigate_page) so the load wait uses
// navigate_page's lenient, configurable timeout instead of
// performance_start_trace's hardcoded 10s reload — which heavy pages exceed and
// which *throws*, losing the trace entirely. Light pages still finish in a few
// seconds because navigate_page returns as soon as the network goes idle; heavy
// pages that never idle return at navTimeoutMs, by which point LCP/CLS have
// already been recorded into the running trace. The about:blank step makes this
// a clean cold load (vs. the old warm reload).
export async function captureTrace(
  client: Client,
  url: string,
  initScript?: string,
  navTimeoutMs: number = TRACE_NAV_TIMEOUT_MS
): Promise<any> {
  await callTool(client, 'navigate_page', { url: 'about:blank', type: 'url' });
  await callTool(client, 'performance_start_trace', { reload: false, autoStop: false });

  const navArgs: Record<string, unknown> = { url, type: 'url', timeout: navTimeoutMs, ignoreCache: true };
  if (initScript) {
    navArgs.initScript = initScript;
  }
  await callTool(client, 'navigate_page', navArgs);

  // Let late LCP / layout shifts land in the trace before stopping.
  await new Promise((resolve) => setTimeout(resolve, TRACE_SETTLE_MS));

  return callTool(client, 'performance_stop_trace', {});
}

export async function evaluateScript(client: Client, functionDeclaration: string): Promise<any> {
  return callTool(client, 'evaluate_script', { function: functionDeclaration });
}

export async function takeScreenshot(client: Client): Promise<any> {
  return callTool(client, 'take_screenshot', {});
}

export async function listNetworkRequests(client: Client): Promise<any> {
  return callTool(client, 'list_network_requests', {});
}

export async function closeMcpClient(client: Client): Promise<void> {
  try {
    await client.close();
    console.log('[MCP] Client closed');
  } catch (err) {
    console.warn('[MCP] Error closing client:', err);
  }
}
