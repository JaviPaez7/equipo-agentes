/** Shared by the published preview and the browser that verifies generated sites. */
export const PREVIEW_CSP = [
  "sandbox allow-scripts allow-forms",
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join("; ");
