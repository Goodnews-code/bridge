import type { Quote } from "../types/quote.js";
import type { Transaction } from "../types/transaction.js";

/**
 * Persistence interfaces. The MVP ships in-memory implementations; swapping to
 * Postgres/Prisma later means implementing these against a DB without touching
 * the services that depend on them.
 */

export interface QuoteStore {
  save(quote: Quote): Promise<Quote>;
  findById(quoteId: string): Promise<Quote | null>;
}

export interface TransactionStore {
  save(transaction: Transaction): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  /** Find by the bank-transfer reference the user quotes when paying. */
  findByTransferReference(reference: string): Promise<Transaction | null>;
  /** Find by the provider-side transaction id (set once the webhook arrives). */
  findByProviderTransactionId(providerTransactionId: string): Promise<Transaction | null>;
  update(transaction: Transaction): Promise<Transaction>;
  list(): Promise<Transaction[]>;
}
