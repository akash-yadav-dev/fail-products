// src/services/referral/server-referral.ts
import { getDb } from "@/db";
import { ProductRepository } from "@/repositories/product-repository";
import { ReferralRepository } from "@/repositories/referral-repository";
import {
  recordOutboundClick as recordOutboundClickUseCase,
  referralHistory as referralHistoryUseCase,
  runReferralMaintenance as runReferralMaintenanceUseCase,
} from "@/services/referral/referral-service";

/**
 * The server-side binding for the referral use cases.
 *
 * Mirrors `src/services/waitlist/server-waitlist.ts`: the use cases stay free
 * of `getDb`, so a test supplies its own database and the maintenance job can
 * be driven from a script with no framework near it.
 */

function referrals() {
  return new ReferralRepository(getDb());
}

export function recordOutboundClick(slug: string) {
  return recordOutboundClickUseCase({
    referrals: referrals(),
    products: new ProductRepository(getDb()),
    slug,
  });
}

export function runReferralMaintenance(now?: Date) {
  return runReferralMaintenanceUseCase({ referrals: referrals(), now });
}

export function referralHistory(productId: string, days?: number) {
  return referralHistoryUseCase({ referrals: referrals(), productId, days });
}

/** Total outbound clicks per listing, for a set the caller already owns. */
export function referralTotals(productIds: readonly string[]) {
  return referrals().totalsByProduct(productIds);
}
