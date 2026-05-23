export interface AnalysisSession {
  id: string;
  url: string;
  status: 'queued' | 'analyzing' | 'baseline_done' | 'waiting_for_selection' | 'applying' | 'complete' | 'error';
  baseline?: BaselineResult;
  suggestions?: Suggestion[];
  optimizations?: OptimizationResult[];
  totalImprovement?: string;
  error?: string;
}

export interface BaselineResult {
  lcp: number;
  cls: number;
  inp: number;
  ttfb: number;
  screenshot?: string;
  traceData?: any;
  networkData?: any;
  report?: AnalysisReport;
}

export interface AnalysisReport {
  summary: string;
  frontendComparison: string[];
  performanceComparison: string[];
  improveNext: string[];
  goodEnough: string[];
  missingEvidence: string[];
}

export interface Suggestion {
  id: string;
  name: string;
  impact: 'high' | 'medium' | 'low';
  expectedImprovement: string;
  explanation: string;
  evidence?: string;
  confidence?: 'high' | 'medium' | 'low';
  initScript: string;
  postLoadScript: string;
}

export interface OptimizationResult {
  id: string;
  name: string;
  before: Partial<BaselineResult>;
  after: Partial<BaselineResult>;
  improvement: string;
  screenshot?: string;
  initScript: string;
  postLoadScript: string;
  explanation: string;
}

export interface SSEEvent {
  type: 'status' | 'baseline' | 'suggestions' | 'optimization' | 'complete' | 'error';
  data: any;
}
