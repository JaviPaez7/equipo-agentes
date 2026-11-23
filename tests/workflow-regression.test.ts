import { afterEach, describe, expect, it, vi } from "vitest";
import { agentTeamWorkflow } from "@/workflows/agent-team";
import * as steps from "@/workflows/steps";

vi.mock("@/workflows/steps", () => ({
  startRun: vi.fn(async () => ({ ok: true })),
  planTasks: vi.fn(async () => ({ rejected: false, taskIds: ["primera", "segunda"] })),
  beginDevelopment: vi.fn(async () => ({})),
  developTurn: vi.fn(async () => ({ done: true })),
  beginTesting: vi.fn(async () => ({})),
  testingTurn: vi.fn(async () => ({ done: true, passed: true })),
  finishTask: vi.fn(),
  validateFinalSite: vi.fn(async () => ({ cancelled: false })),
  summarizeRun: vi.fn(),
  markCancelled: vi.fn(),
  failRun: vi.fn(),
}));

describe("the durable workflow's final validation", () => {
  afterEach(() => vi.clearAllMocks());

  it("revalidates every task after the last edit and before recording the overall result", async () => {
    await agentTeamWorkflow("run");
    expect(vi.mocked(steps.validateFinalSite).mock.calls).toEqual([["run", "primera"], ["run", "segunda"]]);
    const lastDevelopment = vi.mocked(steps.finishTask).mock.invocationCallOrder.at(-1)!;
    const [firstVerification, lastVerification] = vi.mocked(steps.validateFinalSite).mock.invocationCallOrder;
    expect(lastDevelopment).toBeLessThan(firstVerification);
    expect(lastVerification).toBeLessThan(vi.mocked(steps.summarizeRun).mock.invocationCallOrder[0]);
  });

  it("respects cancellation encountered during final checks", async () => {
    vi.mocked(steps.validateFinalSite).mockResolvedValueOnce({ cancelled: true });
    expect(await agentTeamWorkflow("run")).toEqual({ status: "cancelled" });
    expect(steps.validateFinalSite).toHaveBeenCalledTimes(1);
    expect(steps.summarizeRun).not.toHaveBeenCalled();
  });
});
