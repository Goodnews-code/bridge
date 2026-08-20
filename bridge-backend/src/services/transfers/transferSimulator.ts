import { env } from "../../config/env.js";
import { collectionProvider } from "../../providers/payments/collection/index.js";
import type { Transaction } from "../../types/transaction.js";
import { logger } from "../../utils/logger.js";
import { transferService } from "../transfers/transferService.js";

/**
 * DEV-ONLY transfer simulator.
 *
 * In production, an inbound NGN transfer is confirmed solely by the payment
 * provider's webhook. For the offline sandbox demo we reproduce that exact
 * path: build a provider-shaped event, sign it with the real webhook secret,
 * and feed it through the same TransferService.handleWebhook the provider would
 * hit. This guarantees the demo never bypasses signature/amount verification.
 *
 * Guarded by SIMULATE_TRANSFERS (env refuses to enable it in production).
 */
export function isSimulationEnabled(): boolean {
  return env.SIMULATE_TRANSFERS;
}

export async function simulateInboundTransfer(tx: Transaction): Promise<void> {
  if (!env.SIMULATE_TRANSFERS) return;

  const payload = JSON.stringify({
    event: "charge.success",
    data: {
      id: `sim_${tx.id}`,
      reference: tx.transferReference,
      amount: tx.amountToTransferNGN,
      currency: "NGN",
      status: "success",
    },
  });

  const raw = Buffer.from(payload, "utf8");
  const signature = collectionProvider.signPayload(payload);

  // Fire-and-forget on the next tick so the /confirm response returns first,
  // mimicking an out-of-band provider webhook.
  setImmediate(() => {
    transferService
      .handleWebhook(raw, signature)
      .then((result) =>
        logger.info("Simulated transfer processed", {
          transactionId: tx.id,
          status: result.status,
        }),
      )
      .catch((error: unknown) =>
        logger.error("Simulated transfer failed", {
          transactionId: tx.id,
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
  });
}
