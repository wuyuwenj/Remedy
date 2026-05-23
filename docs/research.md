# Gemini 3.5 Flash + Chrome DevTools MCP Research

## Short Answer

Use the Google Gen AI JavaScript SDK as the Gemini client, start `chrome-devtools-mcp` as a local stdio MCP server, wrap the MCP client with `mcpToTool(client)`, and let Gemini 3.5 Flash call DevTools tools during `generateContent`.

This is a good first hackathon slice because it gives us an interactive CLI now and can become the backend agent loop for the Chrome extension later.

## Primary Sources Checked

- Chrome DevTools MCP repository: https://github.com/ChromeDevTools/chrome-devtools-mcp/
- Chrome DevTools MCP tool reference: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- Gemini function calling and MCP docs: https://ai.google.dev/gemini-api/docs/function-calling

## Confirmed Details

- Gemini docs show `gemini-3.5-flash` as a supported model for function calling, parallel function calling, and compositional function calling.
- The JavaScript SDK supports MCP by importing `mcpToTool` from `@google/genai` and passing `tools: [mcpToTool(client)]`.
- Chrome DevTools MCP is started with `npx -y chrome-devtools-mcp@latest`.
- Chrome DevTools MCP requires Node.js 20.19+ or a newer maintenance LTS, current stable Chrome or newer, and npm.
- The DevTools MCP tools we need for Site Doctor include:
  - `navigate_page`
  - `new_page`
  - `take_snapshot`
  - `take_screenshot`
  - `performance_start_trace`
  - `performance_stop_trace`
  - `performance_analyze_insight`
  - `list_network_requests`
  - `list_console_messages`
  - `lighthouse_audit`
- `navigate_page` supports `initScript`, which is the hook we need for measuring before-page-script optimization experiments.

## Prototype Shape

The CLI in `src/cli.ts`:

1. Reads a URL and optional instruction from the terminal.
2. Starts Chrome DevTools MCP as a child stdio server.
3. Connects an MCP client.
4. Sends Gemini 3.5 Flash a bounded Site Doctor prompt with the MCP tools available.
5. Prints Gemini's Markdown evaluation.

Run it with:

```bash
npm install
export GEMINI_API_KEY="..."
npm run dev -- --url https://example.com
```

Useful variants:

```bash
npm run dev -- https://example.com --prompt "Focus on image loading and LCP"
npm run dev -- https://example.com --headed
npm run dev -- https://example.com --browser-url http://127.0.0.1:9222
```

## Caveats

- Gemini's built-in MCP support is documented as experimental and only supports MCP tools, not MCP resources or prompts.
- Chrome DevTools MCP exposes browser content to the model. Do not run this against sensitive authenticated sessions during demos.
- Performance traces may send trace URLs to CrUX unless `--performance-crux=false` is used. This CLI disables CrUX by default.
- Chrome DevTools MCP usage statistics are enabled by default. This CLI disables them by default.
- For production, the extension should not send arbitrary generated JavaScript into a user's active page without validation and a narrow allowlist of safe transformations.

## Next Feature Direction

The next product slice should be a deterministic variation runner:

1. Baseline run: collect snapshot, screenshot, console, network, trace, and optional Lighthouse output.
2. Variant plan: ask Gemini to propose safe CSS-only or DOM-limited variants, expressed as a small allowlisted mutation schema rather than arbitrary JavaScript.
3. Variant execution: reload the page with `initScript` or apply a post-load script through DevTools MCP.
4. Comparison: repeat trace/screenshot checks, then report deltas for performance, visual layout, accessibility, and conversion-critical UI.
5. Output contract: write both Markdown and structured JSON with run metadata, evidence files, findings, good-enough areas, variants, and follow-up checks.

Good early variant types:

- CTA color and contrast checks
- button text or headline copy tests
- spacing fixes for clipped or overlapping elements
- mobile viewport overflow checks
- lazy-loading or font-display experiments
