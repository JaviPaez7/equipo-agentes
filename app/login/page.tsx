import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Iniciar sesión</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Hace falta una cuenta para lanzar ejecuciones (cada una consume la API de Claude). Las ejecuciones se pueden
        ver sin iniciar sesión.
      </p>
      <Suspense fallback={<div className="mt-8 h-64 rounded-xl bg-white ring-1 ring-zinc-200" />}>
        <LoginFormWithNext searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginFormWithNext({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  return <LoginForm next={next} />;
}
