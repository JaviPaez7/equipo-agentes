import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900">
          <span className="flex gap-1" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-violet-500" />
            <span className="size-2.5 rounded-full bg-sky-500" />
            <span className="size-2.5 rounded-full bg-emerald-500" />
          </span>
          Equipo de agentes
        </Link>
        <Suspense fallback={<span className="h-8 w-24" />}>
          <SessionArea />
        </Suspense>
      </div>
    </header>
  );
}

async function SessionArea() {
  const session = await getSession();
  if (!session) {
    return (
      <Link
        href="/login"
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Iniciar sesión
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-zinc-600">
        Sesión: <span className="font-medium text-zinc-900">{session.username}</span>
      </span>
      <form action="/logout" method="post">
        <button type="submit" className="rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
          Salir
        </button>
      </form>
    </div>
  );
}
