import { getConfig, listCardPayments, listCards } from "./read";
import type { ApiPayment } from "./types";
import { useQuery } from "./useQuery";

/**
 * Shared reads for the console.
 *
 * Every list view is derived from the same owner-scoped read endpoints; no page
 * keeps its own copy of chain state, and no page treats the application row
 * status as settlement truth.
 */

/** The owner's cards. Skipped entirely while no session is active. */
export function useOwnerCards(enabled: boolean) {
  return useQuery((signal) => (enabled ? listCards(signal) : Promise.resolve(null)), [enabled]);
}

/** Public chain + contract config. Available without a session. */
export function useChainConfig() {
  return useQuery((signal) => getConfig(signal), []);
}

function recency(payment: ApiPayment): number {
  const candidate = payment.attemptUpdatedAt ?? payment.attemptCreatedAt ?? payment.intentCreatedAt;
  if (candidate === undefined) return 0;
  const parsed = new Date(candidate).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export type PaymentsOverview = {
  payments: ApiPayment[];
  latestIndexedBlock: number | null;
  stale: boolean;
};

/** Payments across every owned card, newest first. */
export function usePaymentsForCards(cardIds: readonly string[]) {
  const key = cardIds.join(",");
  return useQuery<PaymentsOverview | null>(
    async (signal) => {
      const ids = key === "" ? [] : key.split(",");
      if (ids.length === 0) return null;
      const responses = await Promise.all(ids.map((cardId) => listCardPayments(cardId, signal)));
      const payments = responses
        .flatMap((response) => response.payments)
        .sort((left, right) => recency(right) - recency(left));
      const blocks = responses
        .map((response) => response.latestIndexedBlock)
        .filter((value): value is number => value !== null);
      return {
        payments,
        latestIndexedBlock: blocks.length === 0 ? null : Math.max(...blocks),
        stale: responses.some((response) => response.stale),
      };
    },
    [key],
  );
}
