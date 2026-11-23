import { describe, expect, it, vi } from "vitest";
import { BEFORE_PREFIX, previewBase } from "@/lib/site/preview-policy";

vi.mock("@/lib/agents/claude", () => ({
  agentModel: () => "test",
  callClaude: vi.fn(),
  responseText: () => "",
  thinkingSummary: () => "",
  refusalMessage: () => null,
}));

const { iterationHistory } = await import("@/lib/agents/orchestrator");

describe("iterationHistory", () => {
  it("adds nothing for a run that starts from the sample site", () => {
    expect(iterationHistory([])).toBe("");
  });

  it("lists earlier requests oldest first with their results", () => {
    const text = iterationHistory([
      { request: "Añade una página de contacto", summary: "Se creó `contacto.html` y se enlazó en el menú." },
      { request: "Añade opiniones a la portada", summary: null },
    ]);
    expect(text.indexOf("Añade una página de contacto")).toBeLessThan(text.indexOf("Añade opiniones a la portada"));
    expect(text).toContain("Se creó `contacto.html`");
    expect(text).toContain("sin resumen");
    expect(text).toContain("Planifica solo lo que pide la petición nueva");
  });

  it("keeps long summaries bounded", () => {
    const text = iterationHistory([{ request: "Petición", summary: "x".repeat(5000) }]);
    expect(text).not.toContain("x".repeat(601));
    expect(text).toContain("x".repeat(600));
  });
});

describe("previewBase", () => {
  const id = "6f3649b6-0a0c-4e6b-bf99-8aa8db21bb32";

  it("serves the run's current site and the site it started from under separate prefixes", () => {
    expect(previewBase(id, "run")).toBe(`/preview/${id}`);
    expect(previewBase(id, "before")).toBe(`/preview/${BEFORE_PREFIX}${id}`);
  });
});
