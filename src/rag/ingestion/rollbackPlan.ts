import type { IngestionContext } from "./types.js";

export interface RollbackStep {
  phase: string;
  action: () => Promise<void>;
  description: string;
}

export class RollbackPlan {
  private steps: RollbackStep[] = [];

  addStep(phase: string, action: () => Promise<void>, description: string): void {
    this.steps.push({ phase, action, description });
  }

  async execute(): Promise<void> {
    // Execute in reverse order (LIFO)
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const step = this.steps[i];
      try {
        await step.action();
      } catch (error) {
        console.error(`Rollback step failed: ${step.description}`, error);
        // Continue with remaining rollback steps even if one fails
      }
    }
  }

  getSteps(): RollbackStep[] {
    return [...this.steps];
  }

  clear(): void {
    this.steps = [];
  }
}

// Helper functions for rollback logic
export function shouldSkipIndex(ctx: IngestionContext): boolean {
  return ctx.phaseResults.some(r => r.phase === "embed" && r.error !== undefined);
}

export function recordRollbackMetric(ctx: IngestionContext): boolean {
  return ctx.phaseResults.some(r => r.phase === "rollback");
}
