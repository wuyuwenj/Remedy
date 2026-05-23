import express from 'express';
import type { Response } from 'express';
import cors from 'cors';
import type { AnalysisSession, SSEEvent } from './types.js';

import analyzeRouter from './routes/analyze.js';
import streamRouter from './routes/stream.js';
import applyRouter from './routes/apply.js';
import reportRouter from './routes/report.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Active SSE connections per report ID
export const sseClients = new Map<string, Response[]>();

// Active analysis sessions
export const sessions = new Map<string, AnalysisSession>();

// Broadcast an SSE event to all clients listening for a given report
export function broadcastSSE(reportId: string, event: SSEEvent): void {
  const clients = sseClients.get(reportId) || [];
  const data = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach((res) => res.write(data));
}

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use(analyzeRouter);
app.use(streamRouter);
app.use(applyRouter);
app.use(reportRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessions.size, queuedClients: sseClients.size });
});

app.listen(PORT, () => {
  console.log(`[Remedy] Server running on http://localhost:${PORT}`);
});

export default app;
