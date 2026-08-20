import { MockMerchantAdapter } from "./mockMerchant.js";
import type { MerchantPaymentAdapter } from "./types.js";

/**
 * Select the merchant payment adapter. The sandbox mock performs a simulated
 * card authorization; a real deployment might use provider card authorization,
 * a merchant payment API, or extension-assisted checkout (spec §10).
 */
function createMerchantAdapter(): MerchantPaymentAdapter {
  return new MockMerchantAdapter();
}

export const merchantAdapter: MerchantPaymentAdapter = createMerchantAdapter();

export type {
  MerchantPaymentAdapter,
  MerchantAuthorizationInput,
  MerchantAuthorizationResult,
} from "./types.js";
