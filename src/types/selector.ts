export type SelectorStrategyType =
  | 'testid'
  | 'id'
  | 'name'
  | 'aria'
  | 'text'
  | 'css'
  | 'xpath';

export interface SelectorCandidate {
  type: SelectorStrategyType;
  value: string;
  reliabilityScore: number; // 1 (highest) to 10 (fallback)
  description?: string;
}

export interface ElementSelectionResult {
  selector: string;
  strategies: SelectorCandidate[];
  tagName: string;
  id?: string;
  name?: string;
  testId?: string;
  textSnippet?: string;
  ariaLabel?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  frameHierarchy?: string[];
}
