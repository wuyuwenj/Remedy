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
Include visible UI/component analysis whenever evidence supports it: navigation/header, footer, hero area, CTAs/buttons, images/media, text contrast, spacing, sticky elements, layout shifts, and color/style changes that users can actually see.

If the user has asked a question, include an "answer" field in the report object that directly answers their question using the trace/network evidence. Keep the answer concise (2-4 sentences) and grounded in the data.

Required shape:
{
  "report": {
    "summary": "One paragraph verdict comparing the current page with a fast production baseline.",
    "answer": "(Optional) Direct answer to the user's question, if one was provided.",
    "frontendComparison": ["Specific visible UI/layout/content observations. Name the visible component if possible, e.g. navbar, hero CTA, card grid, footer, image/media, form, button color, spacing, sticky element."],
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
      "explanation": "Why this helps (2-3 sentences). If the change is visible, name the affected UI component and the expected visual difference.",
      "evidence": "What trace/network/page evidence supports this.",
      "confidence": "high" | "medium" | "low",
      "initScript": "JavaScript that runs before page scripts to apply the fix",
      "postLoadScript": "JavaScript that applies the fix after page load"
    }
  ]
}

LCP optimization techniques (use these when trace/network evidence supports them):
- PRELOAD HERO IMAGE: If the LCP element is an image that starts loading late, inject <link rel="preload" as="image" href="[url]" fetchpriority="high"> into <head> via initScript. Evidence: large gap between TTFB and image request start in the network waterfall.
- FETCHPRIORITY: If the LCP image loads at low/medium priority, use a MutationObserver in initScript to add fetchpriority="high" to the LCP <img> element as soon as it appears. Evidence: image shown as "Low" priority in network panel.
- DEFER RENDER-BLOCKING SCRIPTS: If scripts block first paint, use initScript to intercept <script> tags via MutationObserver and add defer/async attributes, or move them to after the LCP element. Evidence: long "Evaluate Script" blocks before first paint in the trace.
- PRECONNECT TO CRITICAL ORIGINS: If key resources (fonts, CDN images) require DNS+TCP+TLS before loading, inject <link rel="preconnect" href="[origin]"> in initScript. Evidence: visible connection setup time in the network waterfall for third-party origins.
- LAZY-LOAD BELOW-FOLD IMAGES: Add loading="lazy" to images outside the initial viewport via postLoadScript or MutationObserver in initScript. Keep the hero/LCP image eager. Evidence: many large image requests competing with the LCP resource.

CLS optimization techniques (use these when layout shift evidence is present):
- EXPLICIT IMAGE DIMENSIONS: Use a MutationObserver in initScript to set width/height attributes on <img> and <video> elements based on their natural size or aspect ratio. Evidence: LayoutShift entries correlated with image load times.
- RESERVE SPACE FOR DYNAMIC CONTENT: Inject CSS via initScript that sets min-height on containers that will receive ads, embeds, or late-injected content. Evidence: LayoutShift entries with large shift values from specific DOM regions.
- FONT-DISPLAY SWAP: Inject a <style> block in initScript that overrides @font-face rules with font-display:swap and size-adjust to minimize reflow when custom fonts load. Evidence: LayoutShift entries correlated with font load completion, FOIT (flash of invisible text).
- PREVENT LATE DOM INSERTIONS: If third-party scripts inject content that shifts layout, use initScript to pre-allocate containers or defer those scripts until after LCP. Evidence: LayoutShift entries with hadRecentInput=false after third-party script execution.
- STABLE ABOVE-FOLD LAYOUT: Inject CSS that sets explicit dimensions or aspect-ratio on hero sections, navbars, and carousels to prevent them from reflowing during load. Evidence: multiple small LayoutShift entries from the top of the page.

Rules:
- initScript must work with Page.evaluateOnNewDocument (runs before any page scripts)
- postLoadScript must work when injected into an already-loaded page
- Only suggest frontend/client-side optimizations
- If the main bottleneck is server-side (high TTFB), note it but don't generate a fix script for it
- Scripts must be self-contained, no external dependencies
- Prefer MutationObserver patterns in initScript so the fix intercepts elements as they're parsed, before they trigger layout or resource loads
- Do not invent metrics. If exact values are missing, say what evidence is missing.
- Include "goodEnough" items so the user sees what does not need work yet.`;

export async function analyzePerformance(
  traceData: any,
  networkData: any,
  url: string,
  question?: string
): Promise<{ report: AnalysisReport; suggestions: Suggestion[] }> {
  const questionBlock = question
    ? `\n=== USER QUESTION ===\n${question}\n\nAnswer this question in the report.answer field using the trace/network evidence.\n`
    : '';

  const fullPrompt = `${PERFORMANCE_PROMPT}

URL: ${url}
${questionBlock}
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
  const report: AnalysisReport = {
    summary: value?.summary || 'Gemini returned optimization suggestions but no summary.',
    frontendComparison: toStringArray(value?.frontendComparison),
    performanceComparison: toStringArray(value?.performanceComparison),
    improveNext: toStringArray(value?.improveNext),
    goodEnough: toStringArray(value?.goodEnough),
    missingEvidence: toStringArray(value?.missingEvidence),
  };
  if (typeof value?.answer === 'string' && value.answer.trim()) {
    report.answer = value.answer.trim();
  }
  return report;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
