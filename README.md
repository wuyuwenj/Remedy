# Remedy

**Autonomous Web Performance Agent** | Google I/O Hackathon 2026

> Every tool tells you what's wrong with your site. Remedy fixes it and proves it worked.

## What It Does

1. User pastes a website URL or clicks the Chrome extension on any page.
2. Remedy runs headless Chrome through Chrome DevTools MCP and collects baseline evidence.
3. The backend sends DevTools trace/network/page evidence to Gemini 3.5 Flash.
4. Gemini returns a frontend/performance comparison, what is good enough, and ranked fixes.
5. User picks fixes to test.
6. Backend applies each fix with `initScript`, re-traces, and proves before/after metrics.
7. Web UI and Chrome extension display the results.

## Architecture

```
Website (Vercel)  +  Chrome Extension
         |                  |
         +------fetch()-----+
                  |
        Backend (Node.js, GCP VM)
       /         |          \
 Gemini 3.5   DevTools MCP   Supabase
   Flash     (headless Chrome) (reports)
```

## Project Structure

```text
remedy/
├── server/          # Node.js + TypeScript backend (Express, port 3001)
├── web/             # React + Vite frontend
├── extension/       # Chrome Extension (Manifest V3)
├── supabase/        # Supabase setup SQL
├── src/             # Standalone Gemini + DevTools MCP CLI prototype
├── docs/            # Research and next-step notes
├── .env.example
└── .gitignore
```

## Quick Start

Create `.env` at the repo root:

```bash
cp .env.example .env
```

Set at least:

```bash
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash
```

The backend now loads `.env` from the repo root or `server/.env`.

### Server

```bash
cd server
npm install
npm run dev
```

Runs on [http://localhost:3001](http://localhost:3001).

### Website

```bash
cd web
npm install
npm run dev
```

Runs on [http://localhost:5173](http://localhost:5173) and proxies `/api/*` to the server.

### Chrome Extension

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select the `extension/` directory.
5. Click the Remedy icon on any page to open the side panel.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI API key |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash` |
| `CHROME_DEVTOOLS_MCP_PACKAGE` | No | Defaults to `chrome-devtools-mcp@latest` |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_KEY` | No | Supabase anon key |
| `PORT` | No | Server port, default `3001` |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/analyze` | Submit URL, returns `{ reportId }` |
| GET | `/stream/:id` | SSE stream of agent progress |
| POST | `/apply/:id` | Test selected fixes `{ fixIds: [...] }` |
| GET | `/report/:id` | Get saved report |
| GET | `/health` | Server health check |

## Standalone CLI Prototype

The root CLI is useful for testing Gemini + Chrome DevTools MCP without the web app:

```bash
npm install
npm run dev -- --url "https://example.com"
```

Quote long URLs that contain `&` so your shell does not split the command.

Useful options:

```bash
npm run dev -- --help
npm run dev -- https://example.com --headed
npm run dev -- https://example.com --browser-url http://127.0.0.1:9222
npm run dev -- https://example.com --max-tool-calls 12
```

## Generated DevTools Files

Chrome DevTools MCP may write local evidence files during a run:

- `snapshot.txt`: accessibility-tree snapshot of the page.
- `screenshot.png`: page screenshot from the inspected browser.
- `trace.json.json.gz`: compressed Chrome performance trace. The doubled extension can happen when MCP receives a filename that already contains `.json.gz`.

## How The Agent Works

1. Baseline: navigate with headless Chrome, run trace, take screenshot, capture network.
2. Analysis: send evidence to Gemini 3.5 Flash for comparison and ranked fixes.
3. Testing: navigate with each fix's `initScript`, re-trace, compare metrics.
4. Results: stream before/after metrics and screenshots to the web app and extension.
5. Save: persist to Supabase when configured.

## Next Feature Direction

The next build should add a deterministic variation runner:

- baseline run with fixed viewport
- safe mutation schema for CTA color, text, spacing, and layout checks
- variant execution through `initScript` or post-load DevTools evaluation
- structured JSON output with metrics, screenshots, findings, good-enough areas, and follow-up checks
