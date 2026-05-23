export interface BaselineResult {
  lcp: number;
  cls: number;
  inp: number;
  ttfb: number;
  screenshot?: string;
}

export interface Suggestion {
  id: string;
  name: string;
  impact: 'high' | 'medium' | 'low';
  expectedImprovement: string;
  explanation: string;
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
