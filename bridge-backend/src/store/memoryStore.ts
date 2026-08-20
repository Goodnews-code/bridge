import type { Quote } from "../types/quote.js";
import type { Transaction } from "../types/transaction.js";
import type { QuoteStore, TransactionStore } from "./types.js";

/**
 * In-memory stores for the MVP. Data lives only for the process lifetime.
 * We store shallow clones so callers can't mutate persisted state by reference.
 */

function clone<T>(value: T): T {
  return structuredClone(value);
}

class InMemoryQuoteStore implements QuoteStore {
  private readonly quotes = new Map<string, Quote>();

  async save(quote: Quote): Promise<Quote> {
    this.quotes.set(quote.quoteId, clone(quote));
    return clone(quote);
  }

  async findById(quoteId: string): Promise<Quote | null> {
    const found = this.quotes.get(quoteId);
    return found ? clone(found) : null;
  }
}

class InMemoryTransactionStore implements TransactionStore {
  private readonly transactions = new Map<string, Transaction>();

  async save(transaction: Transaction): Promise<Transaction> {
    this.transactions.set(transaction.id, clone(transaction));
    return clone(transaction);
  }

  async findById(id: string): Promise<Transaction | null> {
    const found = this.transactions.get(id);
    return found ? clone(found) : null;
  }

  async findByTransferReference(reference: string): Promise<Transaction | null> {
    for (const tx of this.transactions.values()) {
      if (tx.transferReference === reference) return clone(tx);
    }
    return null;
  }

  async findByProviderTransactionId(
    providerTransactionId: string,
  ): Promise<Transaction | null> {
    for (const tx of this.transactions.values()) {
      if (tx.providerTransactionId === providerTransactionId) return clone(tx);
    }
    return null;
  }

  async update(transaction: Transaction): Promise<Transaction> {
    this.transactions.set(transaction.id, clone(transaction));
    return clone(transaction);
  }

  async list(): Promise<Transaction[]> {
    return Array.from(this.transactions.values(), clone);
  }
}

// Singleton stores shared across the app.
export const quoteStore: QuoteStore = new InMemoryQuoteStore();
export const transactionStore: TransactionStore = new InMemoryTransactionStore();
