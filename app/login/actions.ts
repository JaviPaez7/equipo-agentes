"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export interface LoginState {
  error: string | null;
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  // Only same-site relative paths, never "//evil.com".
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Introduce usuario y contraseña." };

  const [user] = await getDb().select().from(users).where(eq(users.username, username));
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    await new Promise((resolve) => setTimeout(resolve, 600)); // slows down guessing
    return { error: "Usuario o contraseña incorrectos." };
  }

  await createSession({ userId: user.id, username: user.username });
  redirect(safeNext(formData.get("next")));
}
