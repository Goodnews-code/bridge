import { z } from "zod";
import { env } from "../../../config/env.js";
import { SUPPORTED_CURRENCIES } from "../../../types/money.js";
import { TransferVerificationError } from "../../../utils/errors.js";
import { sign, verifySignature } from "../../../utils/hmac.js";
import type {
  CollectionInstructions,
  CollectionProvider,
  CreateCollectionAccountInput,
  InboundTransferEvent,
} from "./types.js";

/**
 * Sandbox NGN collection provider. Issues deterministic-looking (but fake)
 * virtual account details and verifies HMAC-signed webhooks using the shared
 * PAYMENT_PROVIDER_SECRET. This mirrors how real providers (Paystack/Monnify)
 * sign webhooks, so the verification path is identical when we swap in a real
 * provider.
 */
const inboundEventSchema = z.object({
  event: z.literal("charge.success").or(z.string()),
  data: z.object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    reference: z.string().min(1),
    amount: z.number().positive(),
    currency: z.enum(SUPPORTED_CURRENCIES),
    status: z.enum(["success", "failed", "pending"]),
  }),
});

export class MockCollectionProvider implements CollectionProvider {
  readonly name = "mock";

  constructor(private readonly secret: string = env.PAYMENT_PROVIDER_SECRET) {}

  async createInstructions(
    input: CreateCollectionAccountInput,
  ): Promise<CollectionInstructions> {
    // Fake but stable-looking 10-digit NGN account number.
    const accountNumber = (
      1000000000 +
      (hashToInt(input.reference) % 8999999999)
    ).toString();

    return {
      accountName: env.COLLECTION_ACCOUNT_NAME,
      accountNumber,
      bank: "Paron Sandbox Bank",
      reference: input.reference,
      amount: input.amount,
      currency: input.currency,
      sandbox: true,
    };
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    return verifySignature(rawBody, signature, this.secret);
  }

  parseEvent(rawBody: Buffer): InboundTransferEvent {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new TransferVerificationError("Webhook body is not valid JSON.");
    }

    const parsed = inboundEventSchema.safeParse(json);
    if (!parsed.success) {
      throw new TransferVerificationError("Webhook payload failed validation.", {
        issues: parsed.error.issues.map((i) => i.message),
      });
    }

    const { data } = parsed.data;
    return {
      // Providers usually send a dedicated event id; fall back to the tx id.
      eventId: generateEventId(data.id, data.reference, data.status),
      providerTransactionId: data.id,
      reference: data.reference,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
    };
  }

  signPayload(payload: string): string {
    return sign(payload, this.secret);
  }
}

/** Deterministic event id so retries of the same event dedupe correctly. */
function generateEventId(id: string, reference: string, status: string): string {
  return `evt_${hashToInt(`${id}:${reference}:${status}`).toString(16)}`;
}

/** Small stable string hash (djb2). Not cryptographic — for fake account nos. */
function hashToInt(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}
