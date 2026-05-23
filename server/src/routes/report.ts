import { Router } from 'express';
import type { Request, Response } from 'express';
import { sessions } from '../index.js';
import { getReport } from '../db/supabase.js';
import type { AnalysisSession } from '../types.js';
import { renderReportHtml } from '../report/html.js';

const router = Router();

async function loadReport(id: string): Promise<AnalysisSession | null> {
  const activeSession = sessions.get(id);
  if (activeSession) {
    return activeSession;
  }

  try {
    const report = await getReport(id);
    if (report) {
      return report;
    }
  } catch (err) {
    console.warn('[Report] Supabase lookup failed, falling back to in-memory:', err);
  }

  return null;
}

router.get('/report/:id/html', async (req: Request, res: Response) => {
  const { id } = req.params;
  const session = await loadReport(id);

  if (!session) {
    res.status(404).type('text/plain').send('Report not found');
    return;
  }

  res.type('html').send(renderReportHtml(session));
});

router.get('/report/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const session = await loadReport(id);

  if (!session) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  res.json(session);
});

export default router;
