import { describe, expect, it } from "vitest";
import { applyEditorCommand } from "@/lib/site/editor";
import { normalizePath, resolveReference } from "@/lib/site/paths";

const site = () => ({ "index.html": "<h1>Hola</h1>\n<p>uno</p>\n<p>uno</p>\n", "styles.css": "body{}" });

describe("normalizePath", () => {
  it("accepts simple relative paths", () => {
    expect(normalizePath("/contacto.html")).toBe("contacto.html");
    expect(normalizePath("./css/estilos.css")).toBe("css/estilos.css");
  });

  it.each(["../secreto.html", "a/../../b.html", "%2e%2e/x.html", "C:\\x.html", "script.php", "", "a b.html"])(
    "rejects %s",
    (raw) => {
      expect(() => normalizePath(raw)).toThrow();
    },
  );
});

describe("resolveReference", () => {
  it("resolves like a browser", () => {
    expect(resolveReference("index.html", "contacto.html#form")).toEqual({ kind: "internal", path: "contacto.html", hash: "form" });
    expect(resolveReference("blog/a.html", "../index.html")).toEqual({ kind: "internal", path: "index.html", hash: "" });
    expect(resolveReference("index.html", "/")).toEqual({ kind: "internal", path: "index.html", hash: "" });
    expect(resolveReference("index.html", "https://example.com").kind).toBe("external");
    expect(resolveReference("index.html", "mailto:a@b.c").kind).toBe("ignored");
  });
});

describe("applyEditorCommand", () => {
  it("lists the root", () => {
    const r = applyEditorCommand(site(), { command: "view", path: "/" });
    expect(r.isError).toBe(false);
    expect(r.output).toContain("index.html");
  });

  it("views a file with line numbers", () => {
    const r = applyEditorCommand(site(), { command: "view", path: "index.html", view_range: [2, 2] });
    expect(r.output).toBe("   2\t<p>uno</p>");
  });

  it("creates files", () => {
    const r = applyEditorCommand(site(), { command: "create", path: "contacto.html", file_text: "<h1>Contacto</h1>" });
    expect(r.change).toEqual({ path: "contacto.html", content: "<h1>Contacto</h1>", created: true });
  });

  it("requires a unique match for str_replace", () => {
    expect(applyEditorCommand(site(), { command: "str_replace", path: "index.html", old_str: "<p>uno</p>", new_str: "x" }).isError).toBe(true);
    expect(applyEditorCommand(site(), { command: "str_replace", path: "index.html", old_str: "nada", new_str: "x" }).isError).toBe(true);
    const ok = applyEditorCommand(site(), { command: "str_replace", path: "index.html", old_str: "Hola", new_str: "Adiós $&" });
    expect(ok.change?.content.startsWith("<h1>Adiós $&</h1>")).toBe(true);
  });

  it("inserts after a line", () => {
    const r = applyEditorCommand(site(), { command: "insert", path: "index.html", insert_line: 1, insert_text: "<p>dos</p>" });
    expect(r.change?.content.split("\n")[1]).toBe("<p>dos</p>");
  });

  it("refuses path traversal and unknown commands", () => {
    expect(applyEditorCommand(site(), { command: "create", path: "../x.html", file_text: "" }).isError).toBe(true);
    expect(applyEditorCommand(site(), { command: "undo_edit", path: "index.html" }).isError).toBe(true);
  });
});
