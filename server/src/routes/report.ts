import { Router } from 'express';
import type { Request, Response } from 'express';
import { sessions } from '../index.js';
import { getReport } from '../db/supabase.js';

const router = Router();

router.get('/report/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  // Try Supabase first
  try {
    const report = await getReport(id);
    if (report) {
      res.json(report);
      return;
    }
  } catch (err) {
    console.warn('[Report] Supabase lookup failed, falling back to in-memory:', err);
  }

  // Fall back to in-memory sessions
  const session = sessions.get(id);
  if (!session) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  res.json(session);
});

export default router;
