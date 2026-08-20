import { env } from "../../config/env.js";
import { MockCardProvider } from "./mockCardProvider.js";
import type { CardProvider } from "./types.js";

/**
 * Select the card issuing provider from configuration. Only the sandbox mock
 * exists in the MVP; real providers (Sudo, Bridgecard, etc.) would be added
 * here behind the same CardProvider interface once Bridge's use case is approved.
 */
function createCardProvider(): CardProvider {
  switch (env.CARD_PROVIDER) {
    case "mock":
    default:
      return new MockCardProvider();
  }
}

export const cardProvider: CardProvider = createCardProvider();

export type {
  CardProvider,
  CreateCardInput,
  FundCardInput,
  FundingResult,
  VirtualCard,
} from "./types.js";
