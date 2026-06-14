/**
 * Decimal <-> integer unit conversion using BigInt only. Zero dependencies.
 * Never uses JS floats, so it is safe for 18-decimal token amounts.
 */

/** Parse a human decimal string (e.g. "1.5") into base units given `decimals`. */
export function parseUnits(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`invalid decimal amount: ${value}`);
  }
  const [whole, frac = ""] = value.split(".");
  if (frac.length > decimals) {
    throw new Error(
      `amount ${value} has more than ${decimals} decimal places`,
    );
  }
  const paddedFrac = frac.padEnd(decimals, "0");
  return BigInt(whole + paddedFrac);
}

/** Format base units into a human decimal string given `decimals`. */
export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const out = fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
  return negative ? `-${out}` : out;
}

export const parseEther = (value: string): bigint => parseUnits(value, 18);
export const formatEther = (value: bigint): string => formatUnits(value, 18);
