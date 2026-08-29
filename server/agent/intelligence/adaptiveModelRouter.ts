import type { ModelProfile } from "./modelProfile";
import { ModelRegistry } from "./modelRegistry";
import type {
  ComplexityTier,
  IntelligenceDomain,
  ModelRouter,
  ModelScoreBreakdown,
  RiskLevel,
  RoutingCandidate,
  RoutingDecision,
  RoutingRequest,
} from "./routingTypes";

export const ADAPTIVE_ROUTER_POLICY_VERSION = "adaptive-router-v1";

export class ModelRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRoutingError";
  }
}

const riskRank: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };
const domains = new Set<IntelligenceDomain>(["planning", "coding", "tool-use", "verification"]);
const weights = {
  capability: 0.24,
  domain: 0.22,
  complexity: 0.16,
  risk: 0.12,
  context: 0.08,
  cost: 0.08,
  latency: 0.05,
  structured: 0.05,
} as const;

function finitePositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new ModelRoutingError(`Invalid routing request ${label}.`);
  return value;
}
function optionalPositive(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  return finitePositive(value, label);
}
function validateRequest(request: RoutingRequest): RoutingRequest {
  if (!request || !domains.has(request.domain)) throw new ModelRoutingError("Invalid routing request domain.");
  if (request.complexity !== 1 && request.complexity !== 2 && request.complexity !== 3) throw new ModelRoutingError("Invalid routing request complexity.");
  if (!(request.risk in riskRank)) throw new ModelRoutingError("Invalid routing request risk.");
  const estimatedInputTokens = finitePositive(request.estimatedInputTokens, "estimated input tokens");
  const estimatedOutputTokens = finitePositive(request.estimatedOutputTokens, "estimated output tokens");
  const budgetUsd = optionalPositive(request.budgetUsd, "budget");
  const latencyBudgetMs = optionalPositive(request.latencyBudgetMs, "latency budget");
  const constraints = request.constraints;
  if (constraints !== undefined && (!constraints || typeof constraints !== "object")) throw new ModelRoutingError("Invalid routing request constraints.");
  const normalizedConstraints = constraints
    ? {
        maxCostUsd: optionalPositive(constraints.maxCostUsd, "maximum cost"),
        maxLatencyMs: optionalPositive(constraints.maxLatencyMs, "maximum latency"),
        minimumContextTokens: optionalPositive(constraints.minimumContextTokens, "minimum context"),
        allowedModelIds: constraints.allowedModelIds === undefined ? undefined : validateAllowlist(constraints.allowedModelIds),
        requiredStructuredOutput: constraints.requiredStructuredOutput === undefined ? undefined : validateBoolean(constraints.requiredStructuredOutput, "structured-output constraint"),
      }
    : undefined;
  return { ...request, estimatedInputTokens, estimatedOutputTokens, budgetUsd, latencyBudgetMs, constraints: normalizedConstraints };
}
function validateAllowlist(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== "string" || !item.trim())) throw new ModelRoutingError("Invalid routing request model allowlist.");
  return Array.from(new Set(value.map(item => item.trim())));
}
function validateBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new ModelRoutingError(`Invalid routing request ${label}.`);
  return value;
}
function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
function domainScore(profile: ModelProfile, domain: IntelligenceDomain): number {
  return profile.domains.find(item => item.domain === domain)?.score ?? 0;
}
function estimatedCost(profile: ModelProfile, request: RoutingRequest): number {
  return request.estimatedInputTokens * profile.cost.inputPerMillionTokensUsd / 1_000_000 + request.estimatedOutputTokens * profile.cost.outputPerMillionTokensUsd / 1_000_000;
}
function complexityScore(profileTier: ComplexityTier, requested: ComplexityTier): number {
  if (profileTier < requested) return 0;
  if (profileTier === requested) return 1;
  return requested === 1 ? 0.7 : 0.85;
}
function riskScore(profileRisk: RiskLevel, requested: RiskLevel): number {
  if (riskRank[profileRisk] < riskRank[requested]) return 0;
  return profileRisk === requested ? 1 : 0.85;
}
function scoreCandidate(profile: ModelProfile, request: RoutingRequest, costMax: number, costMin: number, latencyMax: number, latencyMin: number): RoutingCandidate {
  const totalTokens = request.estimatedInputTokens + request.estimatedOutputTokens;
  const cost = estimatedCost(profile, request);
  const costScore = costMax === costMin ? 1 : (costMax - cost) / (costMax - costMin);
  const latencyScore = latencyMax === latencyMin ? 1 : (latencyMax - profile.averageLatencyMs) / (latencyMax - latencyMin);
  const contextScore = Math.min(1, profile.contextWindowTokens / Math.max(totalTokens, request.constraints?.minimumContextTokens ?? 0));
  const structuredScore = request.constraints?.requiredStructuredOutput ? 1 : profile.structuredOutput ? 1 : 0.7;
  const breakdown = {
    capabilityScore: round(profile.reliabilityScore),
    domainScore: round(domainScore(profile, request.domain)),
    complexityScore: round(complexityScore(profile.tier, request.complexity)),
    riskScore: round(riskScore(profile.maximumRisk, request.risk)),
    contextScore: round(contextScore),
    costScore: round(Math.max(0, Math.min(1, costScore))),
    latencyScore: round(Math.max(0, Math.min(1, latencyScore))),
    structuredOutputScore: round(structuredScore),
    totalScore: 0,
  } satisfies ModelScoreBreakdown;
  breakdown.totalScore = round(
    breakdown.capabilityScore * weights.capability +
    breakdown.domainScore * weights.domain +
    breakdown.complexityScore * weights.complexity +
    breakdown.riskScore * weights.risk +
    breakdown.contextScore * weights.context +
    breakdown.costScore * weights.cost +
    breakdown.latencyScore * weights.latency +
    breakdown.structuredOutputScore * weights.structured,
  );
  return { modelId: profile.id, tier: profile.tier, score: breakdown, estimatedCostUsd: round(cost), estimatedLatencyMs: profile.averageLatencyMs };
}

export class AdaptiveModelRouter implements ModelRouter {
  constructor(private readonly registry: ModelRegistry, private readonly policyVersion = ADAPTIVE_ROUTER_POLICY_VERSION) {}

  route(input: RoutingRequest): RoutingDecision {
    const request = validateRequest(input);
    const totalTokens = request.estimatedInputTokens + request.estimatedOutputTokens;
    const maxCost = Math.min(...[request.budgetUsd, request.constraints?.maxCostUsd].filter((value): value is number => value !== undefined));
    const maxLatency = Math.min(...[request.latencyBudgetMs, request.constraints?.maxLatencyMs].filter((value): value is number => value !== undefined));
    const minimumContext = request.constraints?.minimumContextTokens ?? 0;
    const allowlist = request.constraints?.allowedModelIds;
    const requireStructured = request.constraints?.requiredStructuredOutput === true;
    const eligible = this.registry.list({ enabledOnly: true }).filter(profile => {
      if (allowlist && !allowlist.includes(profile.id)) return false;
      if (riskRank[profile.maximumRisk] < riskRank[request.risk]) return false;
      if (profile.tier < request.complexity) return false;
      if (profile.contextWindowTokens < totalTokens || profile.contextWindowTokens < minimumContext) return false;
      if (requireStructured && !profile.structuredOutput) return false;
      const cost = estimatedCost(profile, request);
      if (maxCost !== Infinity && maxCost !== undefined && cost > maxCost) return false;
      if (maxLatency !== Infinity && maxLatency !== undefined && profile.averageLatencyMs > maxLatency) return false;
      return true;
    });
    if (eligible.length === 0) throw new ModelRoutingError("No eligible model satisfies the routing request.");
    const costs = eligible.map(profile => estimatedCost(profile, request));
    const latencies = eligible.map(profile => profile.averageLatencyMs);
    const candidates = eligible.map(profile => scoreCandidate(profile, request, Math.max(...costs), Math.min(...costs), Math.max(...latencies), Math.min(...latencies)))
      .sort((left, right) => right.score.totalScore - left.score.totalScore || left.estimatedCostUsd - right.estimatedCostUsd || left.estimatedLatencyMs - right.estimatedLatencyMs || left.modelId.localeCompare(right.modelId));
    const selected = candidates[0];
    const reason = request.risk === "high" ? "risk-escalation" : request.budgetUsd !== undefined || request.constraints?.maxCostUsd !== undefined ? "budget-constrained" : request.latencyBudgetMs !== undefined || request.constraints?.maxLatencyMs !== undefined ? "latency-constrained" : request.constraints?.minimumContextTokens !== undefined ? "context-fit" : "best-score";
    return { modelId: selected.modelId, tier: selected.tier, reason, candidates, estimatedCostUsd: selected.estimatedCostUsd, estimatedLatencyMs: selected.estimatedLatencyMs, policyVersion: this.policyVersion };
  }
}
