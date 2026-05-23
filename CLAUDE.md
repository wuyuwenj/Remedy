# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Remedy is

An autonomous web performance agent (Google I/O Hackathon 2026). It traces a target website through **Chrome DevTools MCP** (headless Chrome driven by `chrome-devtools-mcp`), sends the evidence to **Gemini** for a frontend/performance comparison and ranked fixes, then *applies* each fix as injected JavaScript, re-traces, and proves before/after metrics.

## Repository layout — three independent npm projects

This is **not** an npm workspace. Each has its own `package.json` and `node_modules`; install and run them separately.

| Dir | What it is | Dev command (from that dir unless noted) |
|-----|-----------|------------------------------------------|
| `/` (root) | Standalone CLI prototype (`src/`). Runs the whole Gemini + MCP loop without the web app. | `npm run dev -- --url "https://example.com"` |
| `server/` | Express backend (port 3001): REST + SSE, agent orchestration, MCP, Supabase. | `npm install && npm run dev` |
| `web/` | React 19 + Vite frontend (port 5173). Routes: Landing → Analyze → Report. | `npm install && npm run dev` |
| `extension/` | Chrome Extension (Manifest V3, side panel). No build step — load `extension/` unpacked. | — |
| `supabase/` | `setup.sql` — `reports` table schema + RLS. | — |

There are **no tests and no linter** configured anywhere. `npm run typecheck` (root) or `npm run build` (`tsc`) is the only static check. Each project compiles `src/` → `dist/` with `tsc`.

## How the two analysis pipelines work

The root CLI and the server share the same core idea but are separate code paths.

**Root CLI (`src/cli.ts`)** has two modes:
- *Agentic* (default): one `generateContent` call with `mcpToTool(mcpClient)` and `automaticFunctionCalling` — Gemini decides which DevTools tools to call (capped by `--max-tool-calls`, default 8). `finalizeReportFromToolHistory` does a tool-disabled second pass if Gemini ends on tool parts instead of text.
- *Deterministic* (`--html-report`, code in `src/local-report.ts`): a fixed sequence — navigate, screenshot, `lighthouse_audit`, performance trace, ask Gemini for issues + visual variants, apply each variant via `initScript`, re-trace, write `reports/<site>-<timestamp>/index.html` + `report.json`.

**Server (`server/src/agent/orchestrator.ts`)** is the production flow used by web/extension:
- `runBaseline`: spins up an MCP client → `navigate_page` → `performance_start_trace` (reload + autoStop) → `performance_analyze_insight` → `take_screenshot` → `list_network_requests` → `analyzePerformance` (Gemini, `gemini.ts`).
- `runOptimizations`: for each selected fix, a **fresh MCP client**, navigate with the fix's `initScript`, re-trace, diff metrics vs baseline.

### The fix mechanism (central concept)
`gemini.ts` prompts Gemini to return JSON with `suggestions[]`, each carrying an `initScript` (runs via `Page.evaluateOnNewDocument`, i.e. before page scripts) and a `postLoadScript`. The server applies a fix by passing `initScript` to `navigate_page`, so "applying a fix" = injecting JS into a fresh page load and re-measuring. Fixes are client-side only by design.

### Metrics are regex-parsed, not structured
`orchestrator.ts:parseMetrics` extracts LCP/CLS/INP/TTFB by **regex over the trace-analysis text** returned by MCP. This is intentionally fragile — if MCP output format changes, metrics silently come back as `0`. Improvements are computed as simple percentage deltas from these numbers.

## Server runtime model (`server/src/`)

- **State is in-memory.** `index.ts` holds `sessions: Map<reportId, AnalysisSession>` and `sseClients: Map<reportId, Response[]>`. Restarting the server drops all sessions not persisted to Supabase.
- **Single-concurrency queue** (`queue.ts`): `MAX_CONCURRENT = 1`, `MAX_QUEUE_SIZE = 10`, **60s job timeout**. Browser runs are serialized; a trace that overruns 60s is killed. Both `/analyze` and `/apply` enqueue work and respond `202` immediately.
- **Progress streams over SSE** (`stream.ts`): `broadcastSSE` pushes `status`/`baseline`/`suggestions`/`optimization`/`complete`/`error` events. A late SSE subscriber is replayed current session state on connect.
- **Supabase is optional** (`db/supabase.ts`): no `SUPABASE_URL`/`SUPABASE_KEY` → persistence is skipped with a warning, never an error. `/report/:id` tries Supabase first, then falls back to the in-memory session.

API: `POST /analyze` → `{reportId}`; `GET /stream/:id` (SSE); `POST /apply/:id` `{fixIds}`; `GET /report/:id`; `GET /health`.

## Conventions and gotchas

- **No dotenv dependency.** Both `src/cli.ts` (`loadEnvFile`) and `server/src/env.ts` (`loadEnvFiles`) hand-parse `.env`. The server searches `.env`, `server/.env`, then `../.env`, and uses `??=` so real env vars always win. Add new env vars to `.env.example`.
- **MCP is spawned via `npx`**, not a dependency. `createMcpClient` / `buildMcpArgs` run `npx -y chrome-devtools-mcp@latest …`. Both the root and server point `npm_config_cache` at the repo-root `.npm-cache/` so the first `npx` fetch is cached (the server detects whether cwd is `server/` to resolve `../`). Override the package with `CHROME_DEVTOOLS_MCP_PACKAGE`.
- **MCP clients are short-lived** — created per analysis/per-fix and explicitly closed (`closeMcpClient`) to avoid Chrome state leaks. Follow this pattern when adding MCP calls.
- **ESM + NodeNext throughout.** Use `.js` extensions in relative imports even from `.ts` files (e.g. `import … from './env.js'`). `"type": "module"` everywhere.
- **`web/` talks to the server only through Vite's proxy**: `/api/*` → `http://localhost:3001` with the `/api` prefix stripped (`vite.config.ts`). Frontend code should call `/api/...`.
- Gemini model defaults to `gemini-3.5-flash` (`GEMINI_MODEL` to override); API key is `GEMINI_API_KEY` (root also accepts `GOOGLE_API_KEY`).
- MCP may drop evidence files in cwd: `snapshot.txt`, `screenshot.png`, `trace.json.json.gz` (the doubled extension is expected). All are gitignored.

## Stray files to be aware of

`src/cli 2.ts` and `dist/cli 2.js` are untracked duplicates (note the space in the name) — not part of the build (`tsconfig` compiles `src/**/*.ts`, and `cli 2.ts` is included, so it will also compile; treat it as dead/duplicate unless told otherwise). Don't import from them.
