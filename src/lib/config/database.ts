// src/lib/config/database.ts
/** Server-only database configuration. Values are never sent to the client. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example and docs/DEPLOYMENT.md.");
  }
  return url;
}
