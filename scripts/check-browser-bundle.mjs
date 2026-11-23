import { readFile } from "node:fs/promises";

// These runtime data files are opened dynamically and can be absent even when next build succeeds.
const trace = new URL("../.next/server/app/.well-known/workflow/v1/flow/route.js.nft.json", import.meta.url);
const { files } = JSON.parse(await readFile(trace, "utf8"));
const paths = files.map((name) => name.replaceAll("\\", "/"));
for (const asset of [
  "playwright-core/browsers.json", "playwright-core/lib/coreBundle.js",
  "@sparticuz/chromium/build/index.js", "@sparticuz/chromium/bin/chromium.br", "@sparticuz/chromium/bin/al2023.tar.br",
]) {
  if (!paths.some((path) => path.endsWith("/node_modules/" + asset))) {
    throw new Error("El paquete del workflow no incluye " + asset);
  }
}
console.log("El workflow incluye Playwright, Chromium y sus archivos de ejecución.");
