import { GoogleGenAI } from '@google/genai';
import type { Suggestion } from '../types.js';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('[Gemini] GEMINI_API_KEY not set — analysis will fail');
}

const ai = new GoogleGenAI({ apiKey: apiKey ?? '' });

const PERFORMANCE_PROMPT = `You are a web performance expert. Analyze this Chrome DevTools performance trace and network request data.

Return a JSON array of up to 5 optimization suggestions, ranked by expected impact on Core Web Vitals. Focus on LCP, CLS, INP, and TTFB.

For each suggestion, provide:
{
  "id": "fix-1",
  "name": "Short description",
  "impact": "high" | "medium" | "low",
  "expectedImprovement": "LCP -40%",
  "explanation": "Why this helps (2-3 sentences)",
  "initScript": "JavaScript that runs before page scripts to apply the fix",
  "postLoadScript": "JavaScript that applies the fix after page load"
}

Rules:
- initScript must work with Page.evaluateOnNewDocument (runs before any page scripts)
- postLoadScript must work when injected into an already-loaded page
- Only suggest frontend/client-side optimizations
- If the main bottleneck is server-side (high TTFB), note it but don't generate a fix script for it
- Scripts must be self-contained, no external dependencies`;

export async function analyzePerformance(
  traceData: any,
  networkData: any,
  url: string
): Promise<Suggestion[]> {
  const fullPrompt = `${PERFORMANCE_PROMPT}

URL: ${url}

=== TRACE DATA ===
${typeof traceData === 'string' ? traceData : JSON.stringify(traceData, null, 2)}

=== NETWORK DATA ===
${typeof networkData === 'string' ? networkData : JSON.stringify(networkData, null, 2)}

Respond ONLY with the JSON array. No markdown, no code fences, just the raw JSON array.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-05-20',
    contents: fullPrompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text = response.text ?? '';

  try {
    const parsed = JSON.parse(text);
    const suggestions: Suggestion[] = Array.isArray(parsed) ? parsed : parsed.suggestions ?? [];
    return suggestions.map((s, i) => ({
      id: s.id || `fix-${i + 1}`,
      name: s.name || 'Unnamed optimization',
      impact: s.impact || 'medium',
      expectedImprovement: s.expectedImprovement || 'Unknown',
      explanation: s.explanation || '',
      initScript: s.initScript || '',
      postLoadScript: s.postLoadScript || '',
    }));
  } catch {
    // Try to extract JSON from text that might have markdown fences
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]) as Suggestion[];
      return arr;
    }
    console.error('[Gemini] Failed to parse response:', text.slice(0, 500));
    throw new Error('Failed to parse Gemini response as JSON');
  }
}
