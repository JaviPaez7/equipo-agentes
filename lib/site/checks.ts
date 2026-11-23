/**
 * Deterministic checks that back Testing's verdict.
 *
 * - `auditSite` is the site-wide audit the system always runs (valid HTML,
 *   broken links, missing assets, JS syntax, orphan pages...). Testing cannot
 *   approve a task while it reports failures.
 * - `runAgentChecks` executes the concrete checks Testing writes for each
 *   acceptance criterion (selectors, texts, links) against the real DOM.
 */
import { Script } from "node:vm";
import { HtmlValidate, StaticConfigLoader } from "html-validate";
import { parseHTML } from "linkedom";
import type { CheckResult } from "@/lib/db/schema";
import { resolveReference } from "./paths";

export type SiteFiles = Record<string, string>;

export const AGENT_CHECK_TYPES = [
  "exists",
  "absent",
  "count_at_least",
  "text_contains",
  "attribute_equals",
  "links_to",
  "file_exists",
] as const;
export type AgentCheckType = (typeof AGENT_CHECK_TYPES)[number];

export interface AgentCheck {
  description: string;
  type: AgentCheckType;
  /** File the check applies to. For file_exists, the file that must exist. */
  page: string;
  selector: string | null;
  attribute: string | null;
  value: string | null;
  min: number | null;
}

const validator = new HtmlValidate(
  new StaticConfigLoader({
    extends: ["html-validate:standard"],
    rules: {
      // Style preferences, not correctness: agents may write either form.
      "void-style": "off",
      "attribute-boolean-style": "off",
      "attribute-empty-style": "off",
      "doctype-style": "off",
      "no-trailing-whitespace": "off",
      // Accessibility rules worth enforcing on every page.
      "input-missing-label": "error",
      "wcag/h37": "error",
      "wcag/h32": "error",
      "wcag/h30": "error",
    },
  }),
);

const MAX_MESSAGES = 8;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function htmlPages(files: SiteFiles): string[] {
  return Object.keys(files)
    .filter((p) => p.endsWith(".html"))
    .sort();
}

function parse(html: string) {
  return parseHTML(html).document;
}

/** Runs the site-wide audit. Every result has `source: "auto"`. */
export async function auditSite(files: SiteFiles): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const pages = htmlPages(files);

  if (!files["index.html"]) {
    results.push({
      source: "auto",
      description: "Existe la portada index.html",
      passed: false,
      detail: "Falta index.html.",
    });
  }

  const linkedFrom = new Map<string, Set<string>>();

  for (const page of pages) {
    const html = files[page];

    // 1. Valid, accessible HTML.
    const report = await validator.validateString(html, page);
    const messages = report.results.flatMap((r) => r.messages).filter((m) => m.severity >= 2);
    results.push({
      source: "auto",
      description: `HTML válido y accesible en ${page}`,
      passed: messages.length === 0,
      detail:
        messages.length === 0
          ? "Sin errores de validación."
          : messages
              .slice(0, MAX_MESSAGES)
              .map((m) => `línea ${m.line}: ${m.message} [${m.ruleId}]`)
              .join("\n") + (messages.length > MAX_MESSAGES ? `\n… y ${messages.length - MAX_MESSAGES} más` : ""),
    });

    const doc = parse(html);

    // 2. Basic document metadata.
    const missing: string[] = [];
    if (!doc.documentElement?.getAttribute("lang")) missing.push('atributo lang en <html>');
    if (!doc.querySelector("title")?.textContent?.trim()) missing.push("<title> con texto");
    if (!doc.querySelector('meta[name="viewport"]')) missing.push('<meta name="viewport">');
    const h1Count = doc.querySelectorAll("h1").length;
    if (h1Count !== 1) missing.push(`exactamente una <h1> (hay ${h1Count})`);
    results.push({
      source: "auto",
      description: `Metadatos y estructura básica en ${page}`,
      passed: missing.length === 0,
      detail: missing.length === 0 ? "lang, <title>, viewport y una <h1>: correcto." : `Falta: ${missing.join(", ")}.`,
    });

    // 3. Links and assets point to files that exist; no external code dependencies.
    const broken: string[] = [];
    const refs: Array<{ attr: string; el: Element; tag: string }> = [];
    for (const el of doc.querySelectorAll("a[href], link[href]")) refs.push({ attr: "href", el, tag: el.tagName.toLowerCase() });
    for (const el of doc.querySelectorAll("script[src], img[src], source[src], iframe[src]")) refs.push({ attr: "src", el, tag: el.tagName.toLowerCase() });

    for (const { attr, el, tag } of refs) {
      const value = el.getAttribute(attr) ?? "";
      const ref = resolveReference(page, value);
      if (ref.kind === "ignored") continue;
      if (ref.kind === "external") {
        const isCode = tag === "script" || (tag === "link" && /stylesheet/i.test(el.getAttribute("rel") ?? ""));
        if (isCode) broken.push(`<${tag}> carga código externo (${value}); la web debe ser autocontenida`);
        continue;
      }
      if (ref.kind === "same-page") {
        if (ref.hash && !doc.getElementById(ref.hash)) broken.push(`ancla #${ref.hash} sin elemento con ese id`);
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(files, ref.path)) {
        broken.push(`<${tag} ${attr}="${value}"> apunta a ${ref.path}, que no existe`);
        continue;
      }
      if (ref.path.endsWith(".html") && ref.path !== page) {
        if (!linkedFrom.has(ref.path)) linkedFrom.set(ref.path, new Set());
        linkedFrom.get(ref.path)!.add(page);
      }
      if (ref.hash && ref.path.endsWith(".html")) {
        const target = ref.path === page ? doc : parse(files[ref.path]);
        if (!target.getElementById(ref.hash)) broken.push(`${value}: ${ref.path} no tiene ningún elemento con id="${ref.hash}"`);
      }
    }
    results.push({
      source: "auto",
      description: `Enlaces y recursos de ${page} resuelven`,
      passed: broken.length === 0,
      detail: broken.length === 0 ? "Todos los enlaces y recursos existen." : broken.slice(0, MAX_MESSAGES).join("\n"),
    });

    // 4. Inline scripts compile.
    const inlineErrors: string[] = [];
    for (const script of doc.querySelectorAll("script:not([src])")) {
      const type = script.getAttribute("type");
      if (type && !/javascript|module/i.test(type)) continue;
      const error = scriptSyntaxError(script.textContent ?? "", type === "module");
      if (error) inlineErrors.push(error);
    }
    if (inlineErrors.length > 0) {
      results.push({
        source: "auto",
        description: `JavaScript en línea de ${page} sin errores de sintaxis`,
        passed: false,
        detail: inlineErrors.join("\n"),
      });
    }
  }

  // 5. Every page other than the home page is reachable from another page.
  const orphans = pages.filter((p) => p !== "index.html" && !linkedFrom.has(p));
  results.push({
    source: "auto",
    description: "Todas las páginas están enlazadas desde otra página",
    passed: orphans.length === 0,
    detail: orphans.length === 0 ? "No hay páginas huérfanas." : `Páginas sin enlaces entrantes: ${orphans.join(", ")}.`,
  });

  // 6. JavaScript and CSS files are syntactically sound.
  for (const path of Object.keys(files).sort()) {
    if (path.endsWith(".js")) {
      const error = scriptSyntaxError(files[path], false);
      results.push({
        source: "auto",
        description: `${path} sin errores de sintaxis`,
        passed: error === null,
        detail: error ?? "Compila correctamente.",
      });
    } else if (path.endsWith(".css")) {
      const error = cssBalanceError(files[path]);
      results.push({
        source: "auto",
        description: `${path} bien formado`,
        passed: error === null,
        detail: error ?? "Llaves y comentarios equilibrados.",
      });
    }
  }

  return results;
}

function scriptSyntaxError(code: string, isModule: boolean): string | null {
  try {
    // Compiles without executing. Modules are wrapped so import/export parse.
    new Script(isModule ? `(async () => {\n${code.replace(/^\s*(import|export)\b.*$/gm, "")}\n})` : code);
    return null;
  } catch (error) {
    return error instanceof SyntaxError ? `SyntaxError: ${error.message}` : String(error);
  }
}

function cssBalanceError(css: string): string | null {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  if (withoutComments.includes("/*")) return "Comentario sin cerrar.";
  const withoutStrings = withoutComments.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  let depth = 0;
  for (const ch of withoutStrings) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth < 0) return "Hay una llave de cierre } sin apertura.";
  }
  return depth === 0 ? null : `Faltan ${depth} llave(s) de cierre }.`;
}

/** Runs the checks Testing wrote. Every result has `source: "agent"`. */
export function runAgentChecks(files: SiteFiles, checks: AgentCheck[]): CheckResult[] {
  return checks.map((check) => runAgentCheck(files, check));
}

function runAgentCheck(files: SiteFiles, check: AgentCheck): CheckResult {
  const base = { source: "agent" as const, description: check.description || `${check.type} en ${check.page}` };
  const page = check.page.replace(/^\/+/, "").replace(/^\.\//, "");

  if (check.type === "file_exists") {
    const ok = Object.prototype.hasOwnProperty.call(files, page);
    return { ...base, passed: ok, detail: ok ? `${page} existe.` : `${page} no existe.` };
  }

  const html = files[page];
  if (html === undefined) return { ...base, passed: false, detail: `La página ${page} no existe.` };
  const doc = parse(html);

  if (check.type === "links_to") {
    const target = (check.value ?? "").replace(/^\/+/, "").replace(/^\.\//, "");
    const anchors = [...doc.querySelectorAll("a[href]")];
    const found = anchors.some((a) => {
      const ref = resolveReference(page, a.getAttribute("href") ?? "");
      return ref.kind === "internal" && ref.path === target;
    });
    return {
      ...base,
      passed: found,
      detail: found ? `${page} enlaza a ${target}.` : `${page} no tiene ningún enlace a ${target}.`,
    };
  }

  const selector = check.selector ?? "";
  let matches: Element[];
  try {
    matches = [...doc.querySelectorAll(selector)];
  } catch {
    return { ...base, passed: false, detail: `Selector CSS no válido: ${selector}` };
  }

  switch (check.type) {
    case "exists":
      return {
        ...base,
        passed: matches.length > 0,
        detail: matches.length > 0 ? `"${selector}" encontrado (${matches.length}).` : `No hay ningún elemento "${selector}" en ${page}.`,
      };
    case "absent":
      return {
        ...base,
        passed: matches.length === 0,
        detail: matches.length === 0 ? `No hay "${selector}", como se esperaba.` : `Hay ${matches.length} elemento(s) "${selector}" que no deberían estar.`,
      };
    case "count_at_least": {
      const min = check.min ?? 1;
      return {
        ...base,
        passed: matches.length >= min,
        detail: `"${selector}": ${matches.length} encontrado(s), mínimo ${min}.`,
      };
    }
    case "text_contains": {
      const expected = normalizeText(check.value ?? "");
      const hit = matches.some((el) => normalizeText(el.textContent ?? "").includes(expected));
      return {
        ...base,
        passed: hit,
        detail: hit
          ? `"${selector}" contiene "${check.value}".`
          : matches.length === 0
            ? `No hay ningún elemento "${selector}".`
            : `Ningún "${selector}" contiene "${check.value}".`,
      };
    }
    case "attribute_equals": {
      const attribute = check.attribute ?? "";
      const values = matches.map((el) => el.getAttribute(attribute));
      const hit = values.some((v) => v !== null && (check.value === null || v === check.value));
      return {
        ...base,
        passed: hit,
        detail: hit
          ? `"${selector}" tiene ${attribute}${check.value === null ? "" : `="${check.value}"`}.`
          : matches.length === 0
            ? `No hay ningún elemento "${selector}".`
            : `Valores de ${attribute} encontrados: ${values.map((v) => (v === null ? "(ausente)" : `"${v}"`)).join(", ")}.`,
      };
    }
    default:
      return { ...base, passed: false, detail: `Tipo de comprobación desconocido: ${String(check.type)}` };
  }
}

export function summarizeChecks(results: CheckResult[]): string {
  const failed = results.filter((r) => !r.passed);
  if (failed.length === 0) return `Las ${results.length} comprobaciones pasan.`;
  return [
    `${failed.length} de ${results.length} comprobaciones fallan:`,
    ...failed.map((r) => `- ${r.description}: ${r.detail.replace(/\n/g, "; ")}`),
  ].join("\n");
}
