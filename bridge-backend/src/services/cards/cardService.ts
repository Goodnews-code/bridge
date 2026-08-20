import { cardProvider } from "../../providers/cards/index.js";
import type { CardProvider, FundingResult, VirtualCard } from "../../providers/cards/index.js";
import type { Transaction } from "../../types/transaction.js";

/**
 * CardService wraps the CardProvider and builds a restricted card configuration
 * from a transaction (spec §9): single-use, spend limit = exact transfer amount,
 * merchant-locked where supported. It exposes only non-sensitive card data.
 */
export class CardService {
  constructor(private readonly provider: CardProvider = cardProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * Create a restricted virtual card sized to the transaction. NGN is the card
   * currency because the card is funded from the user's NGN transfer.
   */
  async createRestrictedCard(tx: Transaction): Promise<VirtualCard> {
    return this.provider.createVirtualCard({
      transactionId: tx.id,
      currency: "NGN",
      spendLimit: tx.amountToTransferNGN,
      singleUse: true,
      merchantName: tx.merchantName,
    });
  }

  async fundCard(cardReference: string, amount: number): Promise<FundingResult> {
    return this.provider.fundCard({ cardReference, amount, currency: "NGN" });
  }

  async freeze(cardReference: string): Promise<void> {
    return this.provider.freezeCard(cardReference);
  }

  async close(cardReference: string): Promise<void> {
    return this.provider.closeCard(cardReference);
  }
}

export const cardService = new CardService();
