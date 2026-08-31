import { sha256Base64Url } from "@/lib/auth/crypto";
import type { AuthRepository } from "@/repositories/auth-repository";

type Scope = "EMAIL" | "IP";

export type DatabaseLimit = {
  name: string;
  scope: Scope;
  limit: number;
  windowSeconds: number;
};

export async function consumeDatabaseLimit(
  repository: AuthRepository,
  rule: DatabaseLimit,
  subject: string,
  now = Date.now()
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const keyHash = await sha256Base64Url(`${rule.name}:${rule.scope}:${subject}`);
  return repository.consumeRateLimit({ ...rule, keyHash, now });
}
