import { Router } from 'express';
import type { Request, Response } from 'express';
import type { SSEEvent } from '../types.js';
import { sseClients, sessions } from '../index.js';

const router = Router();

export function sendSSE(res: Response, event: SSEEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  res.write(data);
}

router.get('/stream/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Register this client
  const clients = sseClients.get(id) || [];
  clients.push(res);
  sseClients.set(id, clients);

  // If session already has data, send it immediately
  const session = sessions.get(id);
  if (session) {
    sendSSE(res, { type: 'status', data: `Status: ${session.status}` });

    if (session.baseline) {
      sendSSE(res, { type: 'baseline', data: session.baseline });
    }
    if (session.suggestions) {
      sendSSE(res, { type: 'suggestions', data: session.suggestions });
    }
    if (session.optimizations) {
      for (const opt of session.optimizations) {
        sendSSE(res, { type: 'optimization', data: opt });
      }
    }
    if (session.status === 'complete') {
      sendSSE(res, {
        type: 'complete',
        data: {
          optimizations: session.optimizations,
          totalImprovement: session.totalImprovement,
        },
      });
    }
    if (session.status === 'error' && session.error) {
      sendSSE(res, { type: 'error', data: session.error });
    }
  }

  // Clean up on close
  req.on('close', () => {
    const current = sseClients.get(id) || [];
    const filtered = current.filter((c) => c !== res);
    if (filtered.length === 0) {
      sseClients.delete(id);
    } else {
      sseClients.set(id, filtered);
    }
  });
});

export default router;
