export type IntelligenceDomain = "planning" | "coding" | "tool-use" | "verification";
export type ComplexityTier = 1 | 2 | 3;
export type RiskLevel = "low" | "medium" | "high";

export type RoutingConstraints = {
  maxCostUsd?: number;
  maxLatencyMs?: number;
  minimumContextTokens?: number;
  allowedModelIds?: string[];
  requiredStructuredOutput?: boolean;
};

export type RoutingRequest = {
  domain: IntelligenceDomain;
  complexity: ComplexityTier;
  risk: RiskLevel;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  budgetUsd?: number;
  latencyBudgetMs?: number;
  constraints?: RoutingConstraints;
};

export type ModelScoreBreakdown = {
  capabilityScore: number;
  domainScore: number;
  complexityScore: number;
  riskScore: number;
  contextScore: number;
  costScore: number;
  latencyScore: number;
  structuredOutputScore: number;
  totalScore: number;
};

export type RoutingCandidate = {
  modelId: string;
  tier: ComplexityTier;
  score: ModelScoreBreakdown;
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
};

export type RoutingDecision = {
  modelId: string;
  tier: ComplexityTier;
  reason: "best-score" | "risk-escalation" | "context-fit" | "budget-constrained" | "latency-constrained" | "fallback";
  candidates: RoutingCandidate[];
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
  policyVersion: string;
};

export interface ModelRouter {
  route(request: RoutingRequest): RoutingDecision;
}
