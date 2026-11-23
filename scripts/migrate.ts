/** Applies the SQL migrations in ./drizzle to DATABASE_URL. Usage: npm run db:migrate */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está configurada");
  await migrate(drizzle(neon(url)), { migrationsFolder: "drizzle" });
  console.log("Migraciones aplicadas.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
