import '../env.js';
import { GoogleGenAI } from '@google/genai';
import type { AnalysisReport, Suggestion } from '../types.js';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('[Gemini] GEMINI_API_KEY not set — analysis will fail');
}

const ai = new GoogleGenAI({ apiKey: apiKey ?? '' });
const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';

const PERFORMANCE_PROMPT = `You are Remedy, an autonomous frontend and web performance evaluator. Analyze Chrome DevTools performance trace, network request data, and page evidence.

Return a JSON object with a frontend/performance comparison and up to 5 optimization suggestions, ranked by expected impact on Core Web Vitals and user experience.

Required shape:
{
  "report": {
    "summary": "One paragraph verdict comparing the current page with a fast production baseline.",
    "frontendComparison": ["Specific visible UI/layout/content observations."],
    "performanceComparison": ["Trace/network-backed performance observations."],
    "improveNext": ["Concrete elements, resources, or implementation areas to improve."],
    "goodEnough": ["What appears acceptable and should not be prioritized now."],
    "missingEvidence": ["Metrics or checks that were unavailable."]
  },
  "suggestions": [
    {
      "id": "fix-1",
      "name": "Short description",
      "impact": "high" | "medium" | "low",
      "expectedImprovement": "LCP -40%",
      "explanation": "Why this helps (2-3 sentences)",
      "evidence": "What trace/network/page evidence supports this.",
      "confidence": "high" | "medium" | "low",
      "initScript": "JavaScript that runs before page scripts to apply the fix",
      "postLoadScript": "JavaScript that applies the fix after page load"
    }
  ]
}

Rules:
- initScript must work with Page.evaluateOnNewDocument (runs before any page scripts)
- postLoadScript must work when injected into an already-loaded page
- Only suggest frontend/client-side optimizations
- If the main bottleneck is server-side (high TTFB), note it but don't generate a fix script for it
- Scripts must be self-contained, no external dependencies
- Do not invent metrics. If exact values are missing, say what evidence is missing.
- Include "goodEnough" items so the user sees what does not need work yet.`;

export async function analyzePerformance(
  traceData: any,
  networkData: any,
  url: string
): Promise<{ report: AnalysisReport; suggestions: Suggestion[] }> {
  const fullPrompt = `${PERFORMANCE_PROMPT}

URL: ${url}

=== TRACE DATA ===
${typeof traceData === 'string' ? traceData : JSON.stringify(traceData, null, 2)}

=== NETWORK DATA ===
${typeof networkData === 'string' ? networkData : JSON.stringify(networkData, null, 2)}

Respond ONLY with the JSON object. No markdown, no code fences.`;

  console.log(`[Gemini] → request model=${model} promptChars=${fullPrompt.length}`);
  const start = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
    config: {
      responseMimeType: 'application/json',
    },
  });
  const text = extractResponseText(response);
  console.log(`[Gemini] ← response in ${Date.now() - start}ms, ${text.length} chars`);

  try {
    const parsed = JSON.parse(text);
    const suggestions: Suggestion[] = Array.isArray(parsed) ? parsed : parsed.suggestions ?? [];
    return {
      report: normalizeReport(Array.isArray(parsed) ? undefined : parsed.report),
      suggestions: suggestions.map((s, i) => ({
        id: s.id || `fix-${i + 1}`,
        name: s.name || 'Unnamed optimization',
        impact: s.impact || 'medium',
        expectedImprovement: s.expectedImprovement || 'Unknown',
        explanation: s.explanation || '',
        evidence: s.evidence || '',
        confidence: s.confidence || 'medium',
        initScript: s.initScript || '',
        postLoadScript: s.postLoadScript || '',
      })),
    };
  } catch {
    // Try to extract JSON from text that might have markdown fences or trailing
    // content. JSON.parse here can also throw (e.g. truncated / extra data), so
    // guard it and fall through to a clear error rather than a raw parser one.
    const match = text.match(/\{[\s\S]*\}/) ?? text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const suggestions: Suggestion[] = Array.isArray(parsed) ? parsed : parsed.suggestions ?? [];
        return {
          report: normalizeReport(Array.isArray(parsed) ? undefined : parsed.report),
          suggestions: suggestions.map((s, i) => ({
            id: s.id || `fix-${i + 1}`,
            name: s.name || 'Unnamed optimization',
            impact: s.impact || 'medium',
            expectedImprovement: s.expectedImprovement || 'Unknown',
            explanation: s.explanation || '',
            evidence: s.evidence || '',
            confidence: s.confidence || 'medium',
            initScript: s.initScript || '',
            postLoadScript: s.postLoadScript || '',
          })),
        };
      } catch {
        // fall through to the clear error below
      }
    }
    console.error('[Gemini] Failed to parse response:', text.slice(0, 500));
    throw new Error('Failed to parse Gemini response as JSON');
  }
}

function extractResponseText(response: any): string {
  const parts = response.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .map((part: any) => part.text)
      .filter((partText: unknown): partText is string => typeof partText === 'string')
      .join('')
      .trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function normalizeReport(value: any): AnalysisReport {
  return {
    summary: value?.summary || 'Gemini returned optimization suggestions but no summary.',
    frontendComparison: toStringArray(value?.frontendComparison),
    performanceComparison: toStringArray(value?.performanceComparison),
    improveNext: toStringArray(value?.improveNext),
    goodEnough: toStringArray(value?.goodEnough),
    missingEvidence: toStringArray(value?.missingEvidence),
  };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
