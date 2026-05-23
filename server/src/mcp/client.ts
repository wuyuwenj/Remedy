import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function createMcpClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
  });

  const client = new Client({
    name: 'remedy-agent',
    version: '1.0.0',
  });

  await client.connect(transport);
  console.log('[MCP] Connected to chrome-devtools-mcp');

  return client;
}

export async function navigatePage(
  client: Client,
  url: string,
  initScript?: string
): Promise<any> {
  const args: Record<string, unknown> = { url, type: 'url' };
  if (initScript) {
    args.initScript = initScript;
  }
  const result = await client.callTool({ name: 'navigate_page', arguments: args });
  return result;
}

export async function startTrace(client: Client): Promise<any> {
  const result = await client.callTool({
    name: 'performance_start_trace',
    arguments: { reload: true, autoStop: true },
  });
  return result;
}

export async function stopTrace(client: Client): Promise<any> {
  const result = await client.callTool({
    name: 'performance_stop_trace',
    arguments: {},
  });
  return result;
}

export async function analyzeTrace(client: Client): Promise<any> {
  const result = await client.callTool({
    name: 'performance_analyze_insight',
    arguments: {},
  });
  return result;
}

export async function takeScreenshot(client: Client): Promise<any> {
  const result = await client.callTool({
    name: 'take_screenshot',
    arguments: {},
  });
  return result;
}

export async function listNetworkRequests(client: Client): Promise<any> {
  const result = await client.callTool({
    name: 'list_network_requests',
    arguments: {},
  });
  return result;
}

export async function closeMcpClient(client: Client): Promise<void> {
  try {
    await client.close();
    console.log('[MCP] Client closed');
  } catch (err) {
    console.warn('[MCP] Error closing client:', err);
  }
}
