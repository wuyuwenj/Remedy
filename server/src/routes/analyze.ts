import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { AnalysisSession } from '../types.js';
import { sessions, broadcastSSE } from '../index.js';
import { enqueue } from '../queue.js';
import { runBaseline } from '../agent/orchestrator.js';
import { saveReport } from '../db/supabase.js';

const router = Router();

router.post('/analyze', async (req: Request, res: Response) => {
  const { url } = req.body;

  // Basic URL validation
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "url" field' });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL format' });
    return;
  }

  const reportId = uuidv4();

  const session: AnalysisSession = {
    id: reportId,
    url,
    status: 'queued',
  };
  sessions.set(reportId, session);

  // Return immediately with the report ID
  res.status(202).json({ reportId });

  // Enqueue the baseline analysis
  enqueue(async () => {
    const emit = (event: Parameters<typeof broadcastSSE>[1]) => {
      broadcastSSE(reportId, event);
    };

    try {
      session.status = 'analyzing';
      emit({ type: 'status', data: 'Analysis started...' });

      const { baseline, suggestions, mcpClient } = await runBaseline(reportId, url, emit);

      session.baseline = baseline;
      session.suggestions = suggestions;
      session.status = 'waiting_for_selection';

      // Persist to Supabase if available
      try {
        await saveReport(session);
      } catch (err) {
        console.warn('[Analyze] Failed to save report to Supabase:', err);
      }

      // Close the MCP client after baseline is done
      const { closeMcpClient } = await import('../mcp/client.js');
      await closeMcpClient(mcpClient);

      emit({ type: 'done', data: { suggestions, metrics: baseline } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      session.status = 'error';
      session.error = message;
      emit({ type: 'error', data: message });
      console.error('[Analyze] Error:', message);
    }
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    session.status = 'error';
    session.error = message;
    broadcastSSE(reportId, { type: 'error', data: message });
    console.error('[Analyze] Queue error:', message);
  });
});

export default router;
