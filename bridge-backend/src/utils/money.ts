/**
 * Money helpers. NGN amounts are represented as major-unit numbers rounded to
 * 2 decimal places. Rounding is centralised here so the FX/spread math is
 * consistent and auditable.
 *
 * Worked example (spec §4):
 *   20 USD * 1500 (rate) = 30000 base NGN
 *   30000 * 2% spread     =   600 spread NGN
 *   30000 + 600           = 30600 final NGN
 */

/** Round to 2 decimal places, avoiding binary float drift (e.g. 1.005). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Convert a foreign amount to NGN at the given rate, rounded to 2dp. */
export function convertToNaira(amount: number, exchangeRate: number): number {
  return roundMoney(amount * exchangeRate);
}

/** Compute the spread amount for a base NGN value at spreadPercent, rounded. */
export function computeSpread(baseNaira: number, spreadPercent: number): number {
  return roundMoney((baseNaira * spreadPercent) / 100);
}

/** Add base + spread into the final transfer amount, rounded. */
export function addSpread(baseNaira: number, spreadAmount: number): number {
  return roundMoney(baseNaira + spreadAmount);
}
