import { describe, expect, it } from "vitest";
import type { CheckResult } from "@/lib/db/schema";
import { approvalProblem, evaluateDefinitions, finalChecks, needsBrowser, type CheckDefinition } from "@/lib/site/acceptance";
import { auditSite, type AgentCheck } from "@/lib/site/checks";
import { SITE_TEMPLATE } from "@/lib/site/template";

const evidence = (criterionId: number, kind: "static" | "browser" = "static"): CheckResult => ({
  criterionId, kind, source: "agent", description: "Condición comprobada", passed: true, detail: "Cumplida",
});
const definition = (criterionId: number, check: Partial<AgentCheck>): CheckDefinition => ({
  kind: "static", check: {
    criterionId, type: "exists", description: "El elemento solicitado existe", page: "index.html", selector: ".horario",
    attribute: null, value: null, min: null, ...check,
  },
});

describe("acceptance of a Testing report", () => {
  const plan = ["Enlace al contacto", "Horario visible", "Formulario con tres campos"];

  it("requires evidence for each criterion, even with a green site audit or repeated assertions for one criterion", () => {
    const audit: CheckResult = { source: "auto", description: "HTML válido", passed: true, detail: "Correcto" };
    expect(approvalProblem(plan, [audit, evidence(1), evidence(1)], 0)).toContain("criterio 2");
    expect(approvalProblem(plan, [audit, evidence(1), evidence(2), evidence(3)], 0)).toBeUndefined();
    expect(approvalProblem(plan, [evidence(1), evidence(2), evidence(4)], 0)).toContain("válido");
  });

  it("rejects an approval that also declares failures or contains a failing check", () => {
    expect(approvalProblem(["A"], [evidence(1)], 1)).toContain("problemas pendientes");
    expect(approvalProblem(["A"], [{ ...evidence(1), passed: false, detail: "Falta el formulario" }], 0)).toContain("Falta el formulario");
  });

  it("does not accept the same file-existence check relabelled for multiple criteria", async () => {
    const entries = await evaluateDefinitions(SITE_TEMPLATE, [1, 2, 3].map((criterionId) =>
      definition(criterionId, { type: "file_exists", selector: null, description: plan[criterionId - 1] }),
    ));
    expect(entries.every((entry) => entry.passed)).toBe(true);
    expect(approvalProblem(plan, entries, 0)).toContain("evidencia específica");
  });

  it("requires browser evidence for behaviour, even if a planner forgets the explicit label", () => {
    for (const criterion of ["[Navegador] aparece la confirmación", "Al enviar el formulario aparece un aviso"]) {
      expect(needsBrowser(criterion)).toBe(true);
      expect(approvalProblem([criterion], [evidence(1)], 0)).toContain("run_browser_checks");
      expect(approvalProblem([criterion], [evidence(1, "browser")], 0)).toBeUndefined();
    }
    expect(needsBrowser("El formulario contiene nombre y correo")).toBe(false);
  });
});

describe("final site regression", () => {
  const plan = ["El horario de apertura aparece en la portada"];
  const withHours = { ...SITE_TEMPLATE, "index.html": SITE_TEMPLATE["index.html"].replace("</main>", '<p class="horario">Lunes a viernes a las 9</p></main>') };
  const spec = definition(1, { type: "text_contains", value: "lunes a viernes" });

  it("detects removal of a feature by a later task even when the final HTML passes the site audit", async () => {
    const original = await evaluateDefinitions(withHours, [spec]);
    expect(approvalProblem(plan, original, 0)).toBeUndefined();
    const regressed = { ...SITE_TEMPLATE };
    const audit = await auditSite(regressed);
    expect(audit.every((check) => check.passed)).toBe(true);
    const final = await finalChecks(regressed, plan, original, audit);
    expect(final).toContainEqual(expect.objectContaining({ criterionId: 1, passed: false, stage: "final" }));
    expect(original[0]).toMatchObject({ passed: true, definition: spec });
    expect((await finalChecks(withHours, plan, original, audit)).every((check) => check.passed)).toBe(true);
  });

  it("reports unavailable evidence for an in-flight legacy task without inventing a replay", async () => {
    const oldReport: CheckResult[] = [{ source: "agent", passed: true, detail: "ok", description: "Comprobado" }];
    expect(await finalChecks(withHours, plan, oldReport, [])).toContainEqual(expect.objectContaining({ passed: false, stage: "final", detail: expect.stringContaining("Falta evidencia") }));
  });

  it("rejects vacuous selectors, text and count assertions", async () => {
    const results = await evaluateDefinitions(withHours, [
      definition(1, { type: "text_contains", selector: "main", value: "" }),
      definition(1, { type: "count_at_least", min: 0 }),
      definition(1, { type: "absent", selector: "" }),
    ]);
    expect(results.every((check) => !check.passed)).toBe(true);
  });
});
