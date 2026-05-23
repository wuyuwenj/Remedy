import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AnalysisSession } from '../types.js';

let supabase: SupabaseClient | null = null;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[Supabase] Client initialized');
} else {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_KEY not set — running without persistence');
}

export async function saveReport(session: AnalysisSession): Promise<string> {
  if (!supabase) {
    console.warn('[Supabase] Skipping save — no client configured');
    return session.id;
  }

  const { error } = await supabase
    .from('reports')
    .upsert({
      id: session.id,
      url: session.url,
      status: session.status,
      baseline: session.baseline ?? null,
      suggestions: session.suggestions ?? null,
      optimizations: session.optimizations ?? null,
      total_improvement: session.totalImprovement ?? null,
      error: session.error ?? null,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[Supabase] Failed to save report:', error.message);
    throw error;
  }

  return session.id;
}

export async function getReport(id: string): Promise<AnalysisSession | null> {
  if (!supabase) {
    console.warn('[Supabase] Skipping fetch — no client configured');
    return null;
  }

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    url: data.url,
    status: data.status,
    baseline: data.baseline ?? undefined,
    suggestions: data.suggestions ?? undefined,
    optimizations: data.optimizations ?? undefined,
    totalImprovement: data.total_improvement ?? undefined,
    error: data.error ?? undefined,
  };
}
