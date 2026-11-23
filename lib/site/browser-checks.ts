import { z } from "zod";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { CheckResult } from "@/lib/db/schema";
import { inlineAssets, type SiteFiles } from "./inline";
import { normalizePath } from "./paths";
import { PREVIEW_CSP } from "./preview-policy";

const actionKinds = ["click", "fill", "select", "press"] as const;
const assertionKinds = ["visible", "hidden", "text_contains", "attribute_equals", "value_equals", "valid", "invalid"] as const;
const viewports = ["mobile", "desktop", "both"] as const;
const simpleText = z.string().trim().min(1).max(320);
const nullableText = z.string().max(500).nullable();
export const browserCheckSchema = z.object({
  criterionId: z.number().int().min(1).max(8),
  description: simpleText,
  page: simpleText,
  viewport: z.enum(viewports),
  actions: z.array(z.object({ kind: z.enum(actionKinds), selector: simpleText, value: nullableText })).min(1).max(10),
  assertions: z.array(z.object({
    kind: z.enum(assertionKinds), selector: simpleText, attribute: nullableText, value: nullableText,
  })).min(1).max(8),
}).superRefine((check, ctx) => {
  if (check.actions.some((a) => a.kind !== "click" && a.value === null)) {
    ctx.addIssue({ code: "custom", message: "Indica value para fill, select y press." });
  }
  for (const a of check.assertions) {
    if ((a.kind === "attribute_equals" && !a.attribute) ||
        (a.kind === "text_contains" && !a.value?.trim()) ||
        (["attribute_equals", "value_equals"].includes(a.kind) && a.value === null)) {
      ctx.addIssue({ code: "custom", message: "Indica el valor esperado y, si corresponde, el atributo." });
    }
  }
});
export type BrowserCheck = z.infer<typeof browserCheckSchema>;

// Keep the tool schema in the provider's strict JSON subset. Limits are enforced by Zod.
const str = { type: "string" };
const nullable = { anyOf: [{ type: "string" }, { type: "null" }] };
const strictObject = (properties: Record<string, unknown>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
export const browserCheckToolSchema = strictObject({
  criterionId: { type: "integer" }, description: str, page: str,
  viewport: { type: "string", enum: viewports, description: "both prueba móvil y escritorio; usa uno para comportamientos exclusivos de ese tamaño." },
  actions: { type: "array", items: strictObject({
    kind: { type: "string", enum: actionKinds }, selector: str, value: nullable,
  }), description: "Pasos en orden. Usa selectores CSS. En click, value es null." },
  assertions: { type: "array", items: strictObject({
    kind: { type: "string", enum: assertionKinds }, selector: str, attribute: nullable, value: nullable,
  }), description: "Resultados observables tras los pasos. Usa null en campos no aplicables." },
});

const ORIGIN = "https://sitio.invalid";
const dimensions = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (process.platform === "linux" && process.env.VERCEL) {
    const { default: binary } = await import("@sparticuz/chromium");
    const executablePath = await binary.executablePath();
    // Supply only runtime paths to the child. Keep Chromium's web-origin checks enabled.
    const env: Record<string, string> = { HOME: "/tmp", TMPDIR: "/tmp" };
    for (const name of ["LD_LIBRARY_PATH", "FONTCONFIG_PATH", "LANG", "PATH"]) {
      if (process.env[name]) env[name] = process.env[name]!;
    }
    return chromium.launch({ executablePath, env, headless: true, timeout: 20_000,
      args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-zygote", "--disable-background-networking"] });
  }
  return chromium.launch({ headless: true, chromiumSandbox: process.platform !== "linux" || process.getuid?.() !== 0,
    channel: process.platform === "win32" ? "msedge" : undefined, timeout: 20_000 });
}

async function serveFiles(context: BrowserContext, files: SiteFiles) {
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN || request.method() !== "GET" || request.resourceType() !== "document") {
      return route.abort();
    }
    const path = url.pathname.slice(1) || "index.html";
    if (!path.endsWith(".html") || !Object.hasOwn(files, path)) return route.abort();
    await route.fulfill({ contentType: "text/html; charset=utf-8", headers: { "Content-Security-Policy": PREVIEW_CSP },
      body: inlineAssets(path, files[path], files) });
  });
}

type Assertion = BrowserCheck["assertions"][number];
async function assertResult(page: Page, a: Assertion) {
  const target = page.locator("css=" + a.selector);
  if (a.kind === "visible" || a.kind === "hidden") {
    await target.waitFor({ state: a.kind });
    return;
  }
  await target.waitFor({ state: "attached" });
  // Allow asynchronous UI updates. The fixed predicate receives plain data.
  await page.waitForFunction(({ kind, selector, value, attribute }) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    switch (kind) {
      case "text_contains": return !!value && (el as HTMLElement).innerText?.toLocaleLowerCase().includes(value.toLocaleLowerCase());
      case "attribute_equals": return !!attribute && el.getAttribute(attribute) === value;
      case "value_equals": return (el as HTMLInputElement).value === value;
      case "valid": return el.matches(":valid");
      case "invalid": return el.matches(":invalid");
      default: return false;
    }
  }, a, { timeout: 1700 });
}

async function runScenario(page: Page, spec: BrowserCheck, size: "mobile" | "desktop") {
  await page.setViewportSize(dimensions[size]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
  await page.goto(ORIGIN + "/" + normalizePath(spec.page), { waitUntil: "domcontentloaded", timeout: 3000 });
  for (const action of spec.actions) {
    const target = page.locator("css=" + action.selector);
    switch (action.kind) {
      case "click": await target.click(); break;
      case "fill": await target.fill(action.value!); break;
      case "select": await target.selectOption(action.value!); break;
      case "press": await target.press(action.value!); break;
    }
  }
  for (const assertion of spec.assertions) {
    try {
      await assertResult(page, assertion);
    } catch {
      throw new Error(`No se cumple ${assertion.kind} en ${assertion.selector} (esperado: ${assertion.value ?? assertion.kind}).`);
    }
  }
  if (errors.length) throw new Error("Error de la página: " + errors[0]);
}

export async function runBrowserChecks(files: SiteFiles, specs: BrowserCheck[]): Promise<CheckResult[]> {
  if (!specs.length) return [];
  const browser = await launchBrowser();
  try {
    // The sandboxed origin and CSP already deny workers. Playwright's optional
    // registration shim itself throws when it reads navigator.serviceWorker on this origin.
    const context = await browser.newContext({ acceptDownloads: false });
    context.setDefaultTimeout(1800);
    await serveFiles(context, files);
    const results: CheckResult[] = [];
    for (const spec of specs) {
      const sizes = spec.viewport === "both" ? (["mobile", "desktop"] as const) : [spec.viewport];
      let detail = "";
      let passed = true;
      for (const size of sizes) {
        const page = await context.newPage();
        try {
          await runScenario(page, spec, size);
          detail += `${size}: ${spec.actions.length} acciones y ${spec.assertions.length} comprobaciones correctas. `;
        } catch (error) {
          detail += `${size}: ${(error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 350)}`;
          passed = false;
          break;
        } finally {
          await page.close();
        }
      }
      results.push({ criterionId: spec.criterionId, description: spec.description, passed, detail: detail.trim(), source: "agent" });
    }
    return results;
  } finally {
    await browser.close();
  }
}
