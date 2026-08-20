import { collectionProvider } from "../../providers/payments/collection/index.js";
import { cardProvider } from "../../providers/cards/index.js";
import { transactionStore } from "../../store/memoryStore.js";
import type { TransactionStore } from "../../store/types.js";
import type { Quote } from "../../types/quote.js";
import type {
  Transaction,
  TransactionEvent,
  TransactionStatus,
} from "../../types/transaction.js";
import { NotFoundError } from "../../utils/errors.js";
import { generateId, generateReference } from "../../utils/id.js";
import { assertTransition } from "./stateMachine.js";

export interface CreateTransactionInput {
  userId: string;
  quote: Quote;
  merchantName: string;
  sourceUrl?: string;
}

/**
 * TransactionService owns the transaction store and is the ONLY place status
 * transitions are applied (guarded by the state machine). It deliberately does
 * not import the orchestrator or transfer service — dependencies point inward.
 */
export class TransactionService {
  constructor(private readonly store: TransactionStore = transactionStore) {}

  /** Create a transaction from a live quote, in AWAITING_TRANSFER. */
  async createFromQuote(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date().toISOString();
    const { quote } = input;

    const base: Transaction = {
      id: generateId("txn"),
      userId: input.userId,
      quoteId: quote.quoteId,
      merchantName: input.merchantName,
      merchantAmount: quote.originalAmount,
      merchantCurrency: quote.originalCurrency,
      ...(input.sourceUrl !== undefined && { sourceUrl: input.sourceUrl }),
      exchangeRate: quote.exchangeRate,
      spreadPercent: quote.spreadPercent,
      amountToTransferNGN: quote.finalNairaAmount,
      provider: collectionProvider.name,
      transferReference: generateReference(),
      cardProvider: cardProvider.name,
      status: "CREATED",
      events: [{ at: now, from: null, to: "CREATED" }],
      createdAt: now,
      updatedAt: now,
      expiresAt: quote.expiresAt,
    };

    // Walk CREATED -> QUOTE_CREATED -> AWAITING_TRANSFER so the audit trail and
    // transition guards are honoured from the very first state.
    let tx = await this.store.save(base);
    tx = this.applyTransition(tx, "QUOTE_CREATED");
    tx = this.applyTransition(tx, "AWAITING_TRANSFER");
    return this.store.update(tx);
  }

  async getById(id: string): Promise<Transaction> {
    const tx = await this.store.findById(id);
    if (!tx) throw new NotFoundError("Transaction not found.", { transactionId: id });
    return tx;
  }

  async findByTransferReference(reference: string): Promise<Transaction | null> {
    return this.store.findByTransferReference(reference);
  }

  async list(): Promise<Transaction[]> {
    return this.store.list();
  }

  /**
   * Transition a stored transaction to `to`, persisting the change and audit
   * event. Throws InvalidStateTransitionError on an illegal move.
   */
  async transition(
    id: string,
    to: TransactionStatus,
    patch: Partial<Transaction> = {},
    reason?: string,
  ): Promise<Transaction> {
    const tx = await this.getById(id);
    const updated = this.applyTransition({ ...tx, ...patch }, to, reason);
    return this.store.update(updated);
  }

  /** Apply arbitrary non-status field updates (e.g. providerTransactionId). */
  async patch(id: string, patch: Partial<Transaction>): Promise<Transaction> {
    const tx = await this.getById(id);
    const updated: Transaction = {
      ...tx,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return this.store.update(updated);
  }

  /** Pure helper: validate + apply a transition to an in-memory tx object. */
  private applyTransition(
    tx: Transaction,
    to: TransactionStatus,
    reason?: string,
  ): Transaction {
    assertTransition(tx.status, to);
    const now = new Date().toISOString();
    const event: TransactionEvent = {
      at: now,
      from: tx.status,
      to,
      ...(reason !== undefined && { reason }),
    };
    return {
      ...tx,
      status: to,
      events: [...tx.events, event],
      updatedAt: now,
    };
  }
}

export const transactionService = new TransactionService();
