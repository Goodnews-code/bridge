import type { Currency } from "../../../types/money.js";

/**
 * Merchant payment adapter (spec §10, §17).
 *
 * Represents "the virtual card is used to pay the merchant". The backend never
 * automates arbitrary checkout pages; instead an adapter authorizes the issued
 * card for the exact amount. Options in the spec:
 *   A) provider card authorization (default here, mocked),
 *   B) a merchant payment API,
 *   C) extension-assisted checkout using provider-issued credentials.
 * All sit behind this single interface so the mechanism can change per merchant.
 */
export interface MerchantAuthorizationInput {
  transactionId: string;
  cardReference: string;
  amount: number;
  currency: Currency;
  merchantName: string;
}

export interface MerchantAuthorizationResult {
  authorized: boolean;
  /** Provider/merchant authorization reference when successful. */
  authorizationId?: string;
  /** Machine-readable decline reason when not authorized. */
  declineReason?: string;
}

export interface MerchantPaymentAdapter {
  readonly name: string;
  authorize(input: MerchantAuthorizationInput): Promise<MerchantAuthorizationResult>;
}
