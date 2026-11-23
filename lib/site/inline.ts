/**
 * Inlines a page's local stylesheets, scripts and SVG images so the preview
 * needs no sub-requests. The preview runs with an opaque (sandboxed) origin,
 * and some browsers and embedded webviews refuse sub-requests from it.
 */
import { parseHTML } from "linkedom";
import { resolveReference } from "./paths";

export type SiteFiles = Record<string, string>;

export function inlineAssets(page: string, html: string, files: SiteFiles, previewBase?: string): string {
  const { document } = parseHTML(html);
  const lookup = (ref: string | null) => {
    if (!ref) return null;
    const resolved = resolveReference(page, ref);
    return resolved.kind === "internal" && Object.prototype.hasOwnProperty.call(files, resolved.path)
      ? files[resolved.path]
      : null;
  };

  for (const link of [...document.querySelectorAll('link[rel~="stylesheet"][href]')]) {
    const css = lookup(link.getAttribute("href"));
    if (css === null) continue;
    const style = document.createElement("style");
    style.setAttribute("data-inlined-from", link.getAttribute("href") ?? "");
    style.textContent = css;
    link.replaceWith(style);
  }

  for (const script of [...document.querySelectorAll("script[src]")]) {
    const js = lookup(script.getAttribute("src"));
    if (js === null) continue;
    const inline = document.createElement("script");
    for (const attr of [...script.attributes]) {
      if (attr.name !== "src") inline.setAttribute(attr.name, attr.value);
    }
    inline.setAttribute("data-inlined-from", script.getAttribute("src") ?? "");
    // Prevent a "</script>" inside the code from closing the tag early.
    inline.textContent = js.replace(/<\/script/gi, "<\\/script");
    script.replaceWith(inline);
  }

  for (const img of [...document.querySelectorAll('img[src$=".svg"]')]) {
    const svg = lookup(img.getAttribute("src"));
    if (svg === null) continue;
    img.setAttribute("src", `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`);
  }

  if (previewBase) addPreviewNavigation(document, page, files, previewBase);
  const doctype = /^\s*<!doctype html>/i.test(html) ? "<!DOCTYPE html>\n" : "";
  return doctype + document.documentElement.outerHTML;
}

function addPreviewNavigation(document: Document, page: string, files: SiteFiles, previewBase: string) {
  // A root-relative link belongs to the virtual site, even when it is served
  // under /preview/{runId}. Use the same path resolution as Testing.
  for (const link of document.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") ?? "";
    const resolved = resolveReference(page, href);
    if (resolved.kind !== "internal" || !Object.hasOwn(files, resolved.path)) continue;
    const target = new URL(href, `https://preview.invalid/${page}`);
    link.setAttribute("href", `${previewBase}/${resolved.path}${target.search}${target.hash}`);
  }

  // Report the actual URL after native navigation. The parent accepts messages
  // only from its own opaque iframe and only for files in the active preview.
  const navigation = document.createElement("script");
  navigation.textContent = `(() => {
    if (parent === window) return;
    const report = () => parent.postMessage(
      { type: "preview-location", href: location.href }, new URL(location.href).origin
    );
    addEventListener("pageshow", report);
    addEventListener("hashchange", report);
    addEventListener("popstate", report);
  })();`;
  document.head.prepend(navigation);
}
