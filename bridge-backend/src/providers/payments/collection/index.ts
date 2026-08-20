import { env } from "../../../config/env.js";
import { MockCollectionProvider } from "./mockCollection.js";
import type { CollectionProvider } from "./types.js";

/**
 * Select the NGN collection provider. Only the sandbox mock exists in the MVP;
 * real providers (Paystack, Monnify, Flutterwave) would slot in here behind the
 * same CollectionProvider interface.
 */
function createCollectionProvider(): CollectionProvider {
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
    default:
      return new MockCollectionProvider();
  }
}

export const collectionProvider: CollectionProvider = createCollectionProvider();

export type {
  CollectionProvider,
  CollectionInstructions,
  CreateCollectionAccountInput,
  InboundTransferEvent,
} from "./types.js";
