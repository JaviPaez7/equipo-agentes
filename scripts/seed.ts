/**
 * Creates (or updates the password of) the demo user from SEED_USERNAME and
 * SEED_PASSWORD. Usage: npm run db:seed
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { users } from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });

async function main() {
  const { DATABASE_URL, SEED_USERNAME, SEED_PASSWORD } = process.env;
  if (!DATABASE_URL || !SEED_USERNAME || !SEED_PASSWORD) {
    throw new Error("Faltan DATABASE_URL, SEED_USERNAME o SEED_PASSWORD");
  }
  if (SEED_PASSWORD.length < 10) throw new Error("SEED_PASSWORD debe tener al menos 10 caracteres");

  const db = drizzle(neon(DATABASE_URL));
  const passwordHash = await hashPassword(SEED_PASSWORD);
  await db
    .insert(users)
    .values({ username: SEED_USERNAME, passwordHash })
    .onConflictDoUpdate({ target: users.username, set: { passwordHash } });
  console.log(`Usuario "${SEED_USERNAME}" listo.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
