import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { planTasks, summarizeRun } from "@/lib/agents/orchestrator";
import { callClaude } from "@/lib/agents/claude";
import { addUsage, getRun, logEvent, setAllAgents, setRunStatus } from "@/lib/runs/repo";

vi.mock("@/lib/agents/claude", () => ({
  agentModel: () => "test", callClaude: vi.fn(), responseText: () => "Resumen del encargo",
  thinkingSummary: () => "", refusalMessage: () => null,
}));
vi.mock("@/lib/runs/repo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/runs/repo")>();
  return {
    ...actual, getRun: vi.fn(), getSiteFiles: vi.fn(async () => ({})), getTasks: vi.fn(async () => []),
    setAgent: vi.fn(), setAllAgents: vi.fn(), setRunStatus: vi.fn(), logEvent: vi.fn(), addUsage: vi.fn(),
  };
});

const usage = { input_tokens: 10, output_tokens: 5 };
const response = { usage } as BetaMessage;

describe("late orchestrator responses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRun).mockResolvedValue({
      status: "running", request: "Añadir página",
    } as NonNullable<Awaited<ReturnType<typeof getRun>>>);
    vi.mocked(callClaude).mockResolvedValue(response);
    vi.mocked(setRunStatus).mockResolvedValue(true);
    vi.mocked(addUsage).mockResolvedValue(false);
  });

  it("discards a plan when the billed response arrives after cancellation", async () => {
    await expect(planTasks("sample")).resolves.toMatchObject({ taskIds: [], cancelled: true });
    expect(addUsage).toHaveBeenCalledWith("sample", "test", usage);
    expect(setRunStatus).toHaveBeenCalledTimes(1);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("discards a summary when the billed response arrives after cancellation", async () => {
    await expect(summarizeRun("sample")).resolves.toBe("cancelled");
    expect(addUsage).toHaveBeenCalledWith("sample", "test", usage);
    expect(setRunStatus).not.toHaveBeenCalled();
    expect(setAllAgents).not.toHaveBeenCalled();
  });

  it("does not announce completion when cancellation wins the final write", async () => {
    vi.mocked(addUsage).mockResolvedValue(true);
    vi.mocked(setRunStatus).mockResolvedValue(false);
    await expect(summarizeRun("sample")).resolves.toBe("cancelled");
    expect(setRunStatus).toHaveBeenCalledWith("sample", "completed", expect.any(Object));
    expect(logEvent).not.toHaveBeenCalled();
    expect(setAllAgents).not.toHaveBeenCalled();
  });
});
