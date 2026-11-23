"use client";

import { useEffect, useRef } from "react";
import { readPreviewLocation } from "@/lib/site/preview-location";

export interface PreviewLocation {
  page: string;
  suffix: string;
}

export function PreviewFrame({ base, pages, location, revision, onNavigate, title, className }: {
  base: string;
  pages: readonly string[];
  location: PreviewLocation;
  revision?: string;
  onNavigate: (location: PreviewLocation) => void;
  title: string;
  className: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const opened = useRef<{ url: string; revision?: string } | null>(null);
  const src = `${base}/${location.page}${location.suffix}`;

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (!frame.current || event.source !== frame.current.contentWindow || event.origin !== "null") return;
      const next = readPreviewLocation(event.data, window.location.origin, base, pages);
      if (!next || !opened.current) return;
      const url = `${base}/${next.page}${next.suffix}`;
      if (opened.current.url === url) return;
      opened.current.url = url;
      onNavigate(next);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [base, pages, onNavigate]);

  useEffect(() => {
    // Native links have already navigated the iframe. Loading them again here
    // would discard the user's scroll, input and browser history entry.
    if (!frame.current || (opened.current?.url === src && opened.current.revision === revision)) return;
    opened.current = { url: src, revision };
    frame.current.src = src;
  }, [src, revision]);

  return <iframe ref={frame} title={title} sandbox="allow-scripts allow-forms" className={className} />;
}
