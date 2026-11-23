import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cached: NeonHttpDatabase<typeof schema> | undefined;

/**
 * Lazily creates the Drizzle client so that importing this module never fails
 * at build time when DATABASE_URL is not set.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está configurada");
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}

export { schema };
