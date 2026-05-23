# Remedy

**Autonomous Web Performance Agent** | Google I/O Hackathon 2026

> Every tool tells you what's wrong with your site. Remedy fixes it and proves it worked.

## What It Does

1. User pastes any URL (website) or clicks the extension on any page
2. Remedy spins up headless Chrome via Chrome DevTools MCP, runs a performance baseline
3. Sends trace data to Gemini 2.5 Flash, gets ranked optimization suggestions
4. User picks which fixes to test
5. Applies each fix via `initScript`, re-traces, proves the improvement with before/after metrics
6. Saves report to Supabase, shareable via link
7. Chrome extension can apply fixes live on the page

## Architecture

```
Website (Vercel)  +  Chrome Extension
         |                  |
         +------fetch()-----+
                  |
        Backend (Node.js, GCP VM)
       /         |          \
  Gemini     DevTools MCP    Supabase
  2.5 Flash  (headless Chrome)  (reports)
```

## Project Structure

```
remedy/
├── server/          # Node.js + TypeScript backend (Express, port 3001)
│   └── src/
│       ├── index.ts              # Server entry, SSE broadcast
│       ├── types.ts              # Shared TypeScript types
│       ├── queue.ts              # In-memory job queue (1 concurrent, 10 max)
│       ├── agent/
│       │   ├── orchestrator.ts   # Main agent loop (baseline + optimization)
│       │   └── gemini.ts         # Gemini 2.5 Flash API integration
│       ├── mcp/
│       │   └── client.ts         # Chrome DevTools MCP client
│       ├── routes/
│       │   ├── analyze.ts        # POST /analyze → starts agent
│       │   ├── stream.ts         # GET /stream/:id → SSE progress
│       │   ├── apply.ts          # POST /apply/:id → test selected fixes
│       │   └── report.ts         # GET /report/:id → saved report
│       └── db/
│           └── supabase.ts       # Supabase client (optional)
│
├── web/             # React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── Landing.tsx       # URL input, hero
│       │   ├── Analyze.tsx       # Live SSE results, fix selection
│       │   └── Report.tsx        # Shareable saved report
│       └── components/
│           ├── AgentLog.tsx       # Terminal-style status stream
│           ├── MetricsCard.tsx    # Color-coded CWV metric
│           ├── OptimizationRow.tsx # Before/after fix result
│           └── BeforeAfter.tsx   # Screenshot comparison
│
├── extension/       # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── service-worker.js         # Tab URL detection, fix injection
│   └── sidepanel/                # Side panel UI (vanilla JS)
│       ├── index.html
│       ├── styles.css
│       └── app.js
│
├── .env.example
└── .gitignore
```

## Quick Start

### 1. Server

```bash
cd server
cp ../.env.example .env
# Edit .env and add your GEMINI_API_KEY (required)
# Optionally add SUPABASE_URL and SUPABASE_KEY

npm install
npm run dev
# Runs on http://localhost:3001
```

### 2. Website

```bash
cd web
npm install
npm run dev
# Runs on http://localhost:5173, proxies /api/* to :3001
```

### 3. Chrome Extension (optional)

```
1. Open chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension/ directory
5. Click the Remedy icon on any page to open the side panel
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI API key for Gemini 2.5 Flash |
| `SUPABASE_URL` | No | Supabase project URL (for report persistence) |
| `SUPABASE_KEY` | No | Supabase anon key |
| `PORT` | No | Server port (default: 3001) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/analyze` | Submit URL, returns `{ reportId }` |
| GET | `/stream/:id` | SSE stream of agent progress |
| POST | `/apply/:id` | Test selected fixes `{ fixIds: [...] }` |
| GET | `/report/:id` | Get saved report |
| GET | `/health` | Server health check |

## How the Agent Works

1. **Baseline**: Navigate to URL with headless Chrome, run performance trace, take screenshot, capture network requests
2. **Analysis**: Send trace + network data to Gemini 2.5 Flash, get back up to 5 ranked optimization suggestions with `initScript` and `postLoadScript` code
3. **Testing**: For each selected fix, navigate with `initScript` injected before page scripts, re-trace, compare metrics
4. **Results**: Calculate improvement percentages, stream before/after to frontend
5. **Save**: Persist to Supabase, generate shareable link

## Core Web Vitals Thresholds

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | < 2.5s | 2.5s - 4.0s | > 4.0s |
| CLS | < 0.1 | 0.1 - 0.25 | > 0.25 |
| INP | < 200ms | 200ms - 500ms | > 500ms |
| TTFB | < 800ms | 800ms - 1800ms | > 1800ms |

## Tech Stack

- **Backend**: Node.js, TypeScript, Express, SSE
- **Frontend**: React 19, Vite 6, TypeScript, react-router-dom v7
- **Extension**: Chrome Manifest V3, Side Panel API, vanilla JS
- **AI**: Gemini 2.5 Flash via @google/genai
- **Browser Automation**: Chrome DevTools MCP via @modelcontextprotocol/sdk
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel (web), GCP VM (server)

## Target Prize Tracks

- Best Use of Managed Agents ($5,000)
- General Track ($7,500 first place)

## Team Tasks

### Phase 1: Get it running locally (priority)
- [ ] Add `GEMINI_API_KEY` to `.env`
- [ ] Test server + web with a real URL end-to-end
- [ ] Verify MCP spawns headless Chrome correctly

### Phase 2: Supabase + Deployment
- [ ] Create Supabase project, run schema (see below)
- [ ] Deploy server to GCP VM
- [ ] Deploy web to Vercel with `VITE_API_URL` env var

### Phase 3: Polish
- [ ] Test Chrome extension
- [ ] Prepare demo with 2-3 target URLs
- [ ] Record backup demo video

### Supabase Schema

```sql
create table reports (
  id text primary key default gen_random_uuid(),
  url text not null,
  baseline jsonb not null,
  suggestions jsonb,
  optimizations jsonb,
  total_improvement text,
  created_at timestamptz default now()
);
```

## Demo Script (2-3 minutes)

1. "Lighthouse tells you your LCP is slow. Remedy fixes it and proves it worked."
2. Paste URL on remedy.dev, watch agent stream analysis
3. Select suggested fixes, show before/after metrics
4. Switch to Chrome extension, analyze current page
5. Click "Apply Fixes" — page transforms live
6. Share report link
7. "One URL. AI finds the fixes. Proves they work. That's Remedy."
