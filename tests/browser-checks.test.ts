import { describe, expect, it } from "vitest";
import { browserCheckSchema, runBrowserChecks, type BrowserCheck } from "@/lib/site/browser-checks";

const files = {
  "index.html": '<!doctype html><html><head></head><body><a href="contacto.html">Contacto</a></body></html>',
  "contacto.html": '<!doctype html><html><head></head><body><form><input type="email" required><button>Enviar</button></form><p role="status"></p><script src="main.js"></script></body></html>',
  "main.js": 'document.querySelector("form").addEventListener("submit", event => { event.preventDefault(); document.querySelector("[role=status]").textContent = "Recibido"; });',
};
const confirmation: BrowserCheck = {
  criterionId: 1, description: "El formulario confirma los datos válidos", page: "index.html", viewport: "both",
  actions: [
    { kind: "click", selector: "a", value: null }, { kind: "fill", selector: "input", value: "demo@example.org" },
    { kind: "click", selector: "button", value: null },
  ],
  assertions: [{ kind: "text_contains", selector: "[role=status]", value: "Recibido", attribute: null }],
};

describe("evidencias de interacción en Chromium", () => {
  it("verifica navegación, validación y JavaScript en una copia aislada", async () => {
    const invalid: BrowserCheck = { ...confirmation, page: "contacto.html", viewport: "mobile",
      actions: [{ kind: "click", selector: "button", value: null }],
      assertions: [{ kind: "invalid", selector: "input", value: null, attribute: null }] };
    const results = await runBrowserChecks(files, [confirmation, invalid]);
    expect(results.every((r) => r.passed), JSON.stringify(results)).toBe(true);
    expect(results[0].detail).toContain("desktop");
  }, 25_000);
  it("detecta al repetir la prueba que una edición posterior ha roto el comportamiento", async () => {
    const [result] = await runBrowserChecks({ ...files, "main.js": "document.querySelector('form').onsubmit = e => e.preventDefault();" },
      [{ ...confirmation, viewport: "mobile" }]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("Recibido");
  }, 20_000);
  it("exige una interacción y una expectativa con contenido", () => {
    expect(browserCheckSchema.safeParse({ ...confirmation, actions: [] }).success).toBe(false);
    expect(browserCheckSchema.safeParse({ ...confirmation, assertions: [{ ...confirmation.assertions[0], value: "" }] }).success).toBe(false);
  });
});
