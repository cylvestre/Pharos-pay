/**
 * Hex <-> byte utilities. Zero dependencies.
 *
 * All on-chain values in this Skill are handled as `0x`-prefixed lowercase hex
 * strings or native `bigint`, never as JS `number`, to avoid precision loss on
 * 256-bit integers.
 */

export type Hex = `0x${string}`;

const HEX_RE = /^0x[0-9a-fA-F]*$/;

export function isHex(value: unknown): value is Hex {
  return typeof value === "string" && HEX_RE.test(value);
}

/** Strip an optional `0x` prefix. */
export function strip0x(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

/** Ensure a `0x` prefix. */
export function add0x(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

export function hexToBytes(value: string): Uint8Array {
  let hex = strip0x(value);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex at index ${i}: ${value}`);
    out[i] = byte;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return `0x${out}`;
}

export function utf8ToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** bigint -> minimal big-endian byte array (no leading zeros; 0n -> empty). */
export function bigintToBytes(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("cannot encode negative bigint");
  if (value === 0n) return new Uint8Array(0);
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  return hexToBytes(hex);
}

/** big-endian byte array -> bigint. */
export function bytesToBigint(bytes: Uint8Array): bigint {
  let out = 0n;
  for (const b of bytes) out = (out << 8n) | BigInt(b);
  return out;
}

/** Left-pad a byte array to `length` with zero bytes. */
export function padLeft(bytes: Uint8Array, length: number): Uint8Array {
  if (bytes.length > length) throw new Error("value longer than target length");
  if (bytes.length === length) return bytes;
  const out = new Uint8Array(length);
  out.set(bytes, length - bytes.length);
  return out;
}

/** Convert a bigint to a fixed 32-byte big-endian array (used for 256-bit words). */
export function bigintTo32Bytes(value: bigint): Uint8Array {
  return padLeft(bigintToBytes(value), 32);
}
