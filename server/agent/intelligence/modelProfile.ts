import type { ComplexityTier, IntelligenceDomain, RiskLevel } from "./routingTypes";

export type DomainCapability = { domain: IntelligenceDomain; score: number };
export type ModelCost = { inputPerMillionTokensUsd: number; outputPerMillionTokensUsd: number };
export type ModelProfile = {
  id: string;
  provider: string;
  tier: ComplexityTier;
  contextWindowTokens: number;
  domains: DomainCapability[];
  maximumRisk: RiskLevel;
  structuredOutput: boolean;
  averageLatencyMs: number;
  cost: ModelCost;
  reliabilityScore: number;
  enabled?: boolean;
};

const domains = new Set<IntelligenceDomain>(["planning", "coding", "tool-use", "verification"]);
const risks = new Set<RiskLevel>(["low", "medium", "high"]);

function finiteNumber(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new Error(`Invalid model profile ${label}.`);
  return value;
}
function boundedScore(value: unknown, label: string): number {
  const score = finiteNumber(value, label);
  if (score > 1) throw new Error(`Invalid model profile ${label}.`);
  return score;
}
function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid model profile ${label}.`);
  return value.trim();
}

export function validateModelProfile(profile: ModelProfile): ModelProfile {
  if (!profile || typeof profile !== "object") throw new Error("Invalid model profile.");
  const id = nonEmpty(profile.id, "id");
  const provider = nonEmpty(profile.provider, "provider");
  if (profile.tier !== 1 && profile.tier !== 2 && profile.tier !== 3) throw new Error("Invalid model profile tier.");
  const contextWindowTokens = finiteNumber(profile.contextWindowTokens, "context window", 1);
  if (!Array.isArray(profile.domains) || profile.domains.length === 0) throw new Error("Invalid model profile domains.");
  const seen = new Set<IntelligenceDomain>();
  const normalizedDomains = profile.domains.map(item => {
    if (!item || !domains.has(item.domain)) throw new Error("Invalid model profile domain.");
    if (seen.has(item.domain)) throw new Error("Duplicate model profile domain.");
    seen.add(item.domain);
    return { domain: item.domain, score: boundedScore(item.score, "domain score") };
  });
  if (!risks.has(profile.maximumRisk)) throw new Error("Invalid model profile maximum risk.");
  if (typeof profile.structuredOutput !== "boolean") throw new Error("Invalid model profile structured-output flag.");
  const averageLatencyMs = finiteNumber(profile.averageLatencyMs, "latency", 0);
  if (!profile.cost || typeof profile.cost !== "object") throw new Error("Invalid model profile cost.");
  const cost = {
    inputPerMillionTokensUsd: finiteNumber(profile.cost.inputPerMillionTokensUsd, "input price", 0),
    outputPerMillionTokensUsd: finiteNumber(profile.cost.outputPerMillionTokensUsd, "output price", 0),
  };
  const reliabilityScore = boundedScore(profile.reliabilityScore, "reliability score");
  if (profile.enabled !== undefined && typeof profile.enabled !== "boolean") throw new Error("Invalid model profile enabled flag.");
  return { id, provider, tier: profile.tier, contextWindowTokens, domains: normalizedDomains, maximumRisk: profile.maximumRisk, structuredOutput: profile.structuredOutput, averageLatencyMs, cost, reliabilityScore, enabled: profile.enabled ?? true };
}

export function cloneModelProfile(profile: ModelProfile): ModelProfile {
  return { ...profile, domains: profile.domains.map(domain => ({ ...domain })), cost: { ...profile.cost } };
}
