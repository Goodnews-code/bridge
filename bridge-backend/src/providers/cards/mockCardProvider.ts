import { randomInt } from "node:crypto";
import type { Currency } from "../../types/money.js";
import { CardCreationError, CardFundingError, NotFoundError } from "../../utils/errors.js";
import { generateId } from "../../utils/id.js";
import { logger } from "../../utils/logger.js";
import type {
  CardProvider,
  CreateCardInput,
  FundCardInput,
  FundingResult,
  VirtualCard,
} from "./types.js";

/**
 * Sandbox virtual-card provider. Simulates issuing restricted, single-use cards
 * with an exact spend limit (spec §9). It generates a last4 and expiry for
 * display but never a real PAN/CVV — full credentials do not exist here and are
 * never stored or logged.
 */
interface StoredCard extends VirtualCard {
  transactionId: string;
}

export class MockCardProvider implements CardProvider {
  readonly name = "mock";
  private readonly cards = new Map<string, StoredCard>();

  async createVirtualCard(input: CreateCardInput): Promise<VirtualCard> {
    if (input.spendLimit <= 0) {
      throw new CardCreationError("Card spend limit must be positive.");
    }

    const cardReference = generateId("card");
    const now = new Date();
    const card: StoredCard = {
      cardReference,
      transactionId: input.transactionId,
      status: "active",
      currency: input.currency,
      spendLimit: input.spendLimit,
      balance: 0,
      brand: "Visa",
      last4: String(randomInt(0, 10000)).padStart(4, "0"),
      expMonth: now.getUTCMonth() + 1,
      expYear: now.getUTCFullYear() + 3,
      singleUse: input.singleUse ?? true,
      // Opaque handle only; not a PAN. A real provider would return a token/URL.
      secureRef: generateId("cardsec"),
    };

    this.cards.set(cardReference, card);
    // Log only non-sensitive metadata.
    logger.info("Virtual card created", {
      cardReference,
      transactionId: input.transactionId,
      currency: input.currency,
      spendLimit: input.spendLimit,
      singleUse: card.singleUse,
      last4: card.last4,
    });

    return this.toPublic(card);
  }

  async fundCard(input: FundCardInput): Promise<FundingResult> {
    const card = this.cards.get(input.cardReference);
    if (!card) {
      throw new CardFundingError("Cannot fund an unknown card.", {
        cardReference: input.cardReference,
      });
    }
    if (card.currency !== input.currency) {
      throw new CardFundingError("Funding currency does not match the card.", {
        cardReference: input.cardReference,
      });
    }
    if (card.balance + input.amount > card.spendLimit + 1e-9) {
      throw new CardFundingError("Funding would exceed the card spend limit.", {
        cardReference: input.cardReference,
      });
    }

    card.balance = Math.round((card.balance + input.amount) * 100) / 100;
    logger.info("Virtual card funded", {
      cardReference: card.cardReference,
      fundedAmount: input.amount,
      balance: card.balance,
      currency: card.currency,
    });

    return {
      cardReference: card.cardReference,
      fundedAmount: input.amount,
      balance: card.balance,
      currency: card.currency,
    };
  }

  async getCard(cardReference: string): Promise<VirtualCard> {
    const card = this.cards.get(cardReference);
    if (!card) throw new NotFoundError("Card not found.", { cardReference });
    return this.toPublic(card);
  }

  async freezeCard(cardReference: string): Promise<void> {
    const card = this.requireCard(cardReference);
    card.status = "frozen";
    logger.info("Virtual card frozen", { cardReference });
  }

  async closeCard(cardReference: string): Promise<void> {
    const card = this.requireCard(cardReference);
    card.status = "closed";
    logger.info("Virtual card closed", { cardReference });
  }

  /**
   * Internal helper used by the mock merchant adapter to debit a card during a
   * simulated authorization. Not part of the CardProvider interface.
   */
  authorizeSpend(cardReference: string, amount: number, currency: Currency): boolean {
    const card = this.cards.get(cardReference);
    if (!card) return false;
    if (card.status !== "active") return false;
    if (card.currency !== currency) return false;
    if (amount > card.balance + 1e-9) return false;
    card.balance = Math.round((card.balance - amount) * 100) / 100;
    if (card.singleUse) card.status = "closed";
    return true;
  }

  private requireCard(cardReference: string): StoredCard {
    const card = this.cards.get(cardReference);
    if (!card) throw new NotFoundError("Card not found.", { cardReference });
    return card;
  }

  private toPublic(card: StoredCard): VirtualCard {
    const { transactionId: _ignored, ...pub } = card;
    void _ignored;
    return { ...pub };
  }
}
