export type GovernancePolicies = {
  maxTenantConcurrent?: number;
  maxDocs?: number;
  maxDocBytes?: number;
  chunkCountCap?: number;
  denyResourceTags?: string[];
  allowResourceTags?: string[];
  embeddingCostBudgetUSD?: number;
  abortBlockedRatioAbove?: number; // e.g. 0.5 -> abort if >50% blocked
};

export type PolicyEvaluation = {
  ok: boolean;
  reason?: string;
  blocked?: boolean;
};

export class PolicyEngine {
  constructor(private policies: GovernancePolicies = {}) {}

  evaluatePreSubmit(tenant: string, activeIngestions: number, docsLength: number, docBytesSum: number): PolicyEvaluation {
    if (this.policies.maxTenantConcurrent && activeIngestions >= this.policies.maxTenantConcurrent) {
      return { ok: false, reason: `Tenant ${tenant} concurrency cap reached` };
    }
    if (this.policies.maxDocs && docsLength > this.policies.maxDocs) {
      return { ok: false, reason: `Document count ${docsLength} exceeds maxDocs ${this.policies.maxDocs}` };
    }
    if (this.policies.maxDocBytes && docBytesSum > this.policies.maxDocBytes) {
      return { ok: false, reason: `Total doc bytes ${docBytesSum} exceed limit ${this.policies.maxDocBytes}` };
    }
    return { ok: true };
  }

  evaluateResourceTags(tags: string[] | undefined): PolicyEvaluation {
    if (!tags || !tags.length) return { ok: true };
    if (this.policies.denyResourceTags && tags.some(t => this.policies.denyResourceTags!.includes(t))) {
      return { ok: false, reason: "Contains denied resource tag", blocked: true };
    }
    if (this.policies.allowResourceTags && tags.some(t => !this.policies.allowResourceTags!.includes(t))) {
      return { ok: false, reason: "Contains resource tag not explicitly allowed", blocked: true };
    }
    return { ok: true };
  }

  evaluateCost(currentUSD: number): PolicyEvaluation {
    if (this.policies.embeddingCostBudgetUSD != null && currentUSD > this.policies.embeddingCostBudgetUSD) {
      return { ok: false, reason: "Embedding cost budget exceeded", blocked: true };
    }
    return { ok: true };
  }

  evaluateBlockedRatio(blockedCount: number, totalDocs: number): PolicyEvaluation {
    if (totalDocs === 0) return { ok: true };
    const ratio = blockedCount / totalDocs;
    if (this.policies.abortBlockedRatioAbove != null && ratio > this.policies.abortBlockedRatioAbove) {
      return { ok: false, reason: `Blocked ratio ${ratio.toFixed(2)} exceeds threshold`, blocked: true };
    }
    return { ok: true };
  }
}