import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { inlineAssets } from "@/lib/site/inline";
import { readPreviewLocation } from "@/lib/site/preview-location";

const base = "/preview/ejemplo";
const origin = "https://equipo.example";
const files = {
  "index.html": "<html lang='es'><body>Inicio</body></html>",
  "catalogo/pan.html": "<html lang='es'><body>Pan</body></html>",
};

describe("navigation inside a sandboxed preview", () => {
  const page = "catalogo/pan.html";
  const html = `<!doctype html><html lang="es"><head><title>Pan</title></head><body>
    <a id="root" href="/">Inicio</a>
    <a id="relative" href="../index.html?desde=pan#horario">Horario</a>
    <a id="same" href="#ingredientes">Ingredientes</a>
    <a id="mail" href="mailto:pan@example.com">Correo</a>
    </body></html>`;

  it("preserves relative, root-relative and fragment destinations in the assigned site", () => {
    const { document } = parseHTML(inlineAssets(page, html, files, base));
    const href = (id: string) => document.getElementById(id)?.getAttribute("href");
    expect(href("root")).toBe(`${base}/index.html`);
    expect(href("relative")).toBe(`${base}/index.html?desde=pan#horario`);
    expect(href("same")).toBe("#ingredientes");
    expect(href("mail")).toBe("mailto:pan@example.com");
    expect(document.head.querySelector("script")?.textContent).toContain("preview-location");
  });

  it("leaves virtual links and the browsing context untouched for the Testing runner", () => {
    const { document } = parseHTML(inlineAssets(page, html, files));
    expect(document.getElementById("relative")?.getAttribute("href")).toBe("../index.html?desde=pan#horario");
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("syncs nested pages with their query string and fragment", () => {
    const data = { type: "preview-location", href: `${origin}${base}/${page}?f=pan#detalles` };
    expect(readPreviewLocation(data, origin, base, Object.keys(files)))
      .toEqual({ page, suffix: "?f=pan#detalles" });
  });

  it.each([
    { type: "preview-location", href: "invalid" },
    { type: "preview-location", href: `https://other.example${base}/index.html` },
    { type: "preview-location", href: `${origin}/preview/otra/index.html` },
    { type: "preview-location", href: `${origin}${base}/no-existe.html` },
    { type: "preview-location", href: `${origin}${base}/../index.html` },
    { type: "other", href: `${origin}${base}/index.html` },
    null,
  ])("ignores a message outside the current site's known pages", (message) => {
    expect(readPreviewLocation(message, origin, base, Object.keys(files))).toBeNull();
  });
});
