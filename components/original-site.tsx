"use client";

import { useState } from "react";
import { PreviewFrame } from "./run/preview-frame";

export function OriginalSite({ pages }: { pages: string[] }) {
  const base = "/preview/original";
  const [location, setLocation] = useState({ page: "index.html", suffix: "" });
  return (
    <figure className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 lg:col-span-7">
      <figcaption className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 text-sm">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-zinc-200" />
          <span className="size-2.5 rounded-full bg-zinc-200" />
          <span className="size-2.5 rounded-full bg-zinc-200" />
        </span>
        <span className="text-zinc-600">Web de partida · Panadería La Espiga</span>
        <a href={`${base}/${location.page}${location.suffix}`} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-violet-700 hover:underline">
          Abrir en una pestaña ↗
        </a>
      </figcaption>
      <PreviewFrame
        base={base}
        pages={pages}
        location={location}
        onNavigate={setLocation}
        title="Web de partida: Panadería La Espiga"
        className="h-80 w-full bg-white sm:h-[26rem]"
      />
    </figure>
  );
}
