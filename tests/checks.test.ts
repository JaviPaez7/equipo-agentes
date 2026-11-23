import { describe, expect, it } from "vitest";
import { auditSite, runAgentChecks, type AgentCheck } from "@/lib/site/checks";
import { SITE_TEMPLATE } from "@/lib/site/template";

const files = () => ({ ...SITE_TEMPLATE });

const check = (partial: Partial<AgentCheck> & Pick<AgentCheck, "type" | "page">): AgentCheck => ({
  description: "",
  selector: null,
  attribute: null,
  value: null,
  min: null,
  ...partial,
});

describe("auditSite", () => {
  it("passes on the untouched sample site", async () => {
    const results = await auditSite(files());
    const failed = results.filter((r) => !r.passed);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  });

  it("detects a link to a page that does not exist", async () => {
    const site = files();
    site["index.html"] = site["index.html"].replace(
      '<li><a href="nosotros.html">Nosotros</a></li>',
      '<li><a href="nosotros.html">Nosotros</a></li>\n          <li><a href="contacto.html">Contacto</a></li>',
    );
    const results = await auditSite(site);
    const links = results.find((r) => r.description === "Enlaces y recursos de index.html resuelven");
    expect(links?.passed).toBe(false);
    expect(links?.detail).toContain("contacto.html");
  });

  it("detects an orphan page", async () => {
    const site = files();
    site["contacto.html"] = site["nosotros.html"];
    const results = await auditSite(site);
    const orphan = results.find((r) => r.description.startsWith("Todas las páginas"));
    expect(orphan?.passed).toBe(false);
    expect(orphan?.detail).toContain("contacto.html");
  });

  it("detects invalid HTML and missing form labels", async () => {
    const site = files();
    site["index.html"] = site["index.html"].replace(
      "</main>",
      '<form><input type="email" name="email"><div><p>sin cerrar</div></form>\n  </main>',
    );
    const results = await auditSite(site);
    const html = results.find((r) => r.description === "HTML válido y accesible en index.html");
    expect(html?.passed).toBe(false);
    expect(html?.detail).toMatch(/input-missing-label|close-order/);
  });

  it("detects JavaScript syntax errors and unbalanced CSS", async () => {
    const site = files();
    site["main.js"] = "const a = ;";
    site["styles.css"] += "\n.broken { color: red;";
    const results = await auditSite(site);
    expect(results.find((r) => r.description === "main.js sin errores de sintaxis")?.passed).toBe(false);
    expect(results.find((r) => r.description === "styles.css bien formado")?.passed).toBe(false);
  });

  it("rejects external scripts", async () => {
    const site = files();
    site["index.html"] = site["index.html"].replace(
      "</head>",
      '  <script src="https://cdn.example.com/x.js"></script>\n</head>',
    );
    const results = await auditSite(site);
    const links = results.find((r) => r.description === "Enlaces y recursos de index.html resuelven");
    expect(links?.passed).toBe(false);
    expect(links?.detail).toContain("autocontenida");
  });
});

describe("runAgentChecks", () => {
  it("evaluates selectors, texts, attributes and links", () => {
    const [exists, absent, text, attr, link, file, count] = runAgentChecks(files(), [
      check({ type: "exists", page: "index.html", selector: "nav a[href='productos.html']" }),
      check({ type: "absent", page: "index.html", selector: "form" }),
      check({ type: "text_contains", page: "index.html", selector: "h1", value: "MASA MADRE" }),
      check({ type: "attribute_equals", page: "/index.html", selector: "html", attribute: "lang", value: "es" }),
      check({ type: "links_to", page: "productos.html", value: "nosotros.html" }),
      check({ type: "file_exists", page: "contacto.html" }),
      check({ type: "count_at_least", page: "productos.html", selector: ".product", min: 5 }),
    ]);
    expect(exists.passed).toBe(true);
    expect(absent.passed).toBe(true);
    expect(text.passed).toBe(true);
    expect(attr.passed).toBe(true);
    expect(link.passed).toBe(true);
    expect(file.passed).toBe(false);
    expect(count.passed).toBe(true);
  });

  it("reports invalid selectors instead of throwing", () => {
    const [result] = runAgentChecks(files(), [check({ type: "exists", page: "index.html", selector: "a[[" })]);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("Selector CSS no válido");
  });
});
