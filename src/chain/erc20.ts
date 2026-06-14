/**
 * Minimal ERC-20 ABI encoding/decoding for the calls this Skill needs:
 * balanceOf, decimals, symbol, and transfer. Zero dependencies.
 */

import { keccak256Utf8 } from "../crypto/keccak.ts";
import {
  type Hex,
  add0x,
  bytesToHex,
  hexToBytes,
  strip0x,
  bigintTo32Bytes,
  bytesToBigint,
} from "../crypto/hex.ts";
import { normalizeAddress } from "./account.ts";

/** 4-byte function selector = keccak256(signature)[0:4]. */
export function selector(signature: string): Hex {
  return bytesToHex(keccak256Utf8(signature).slice(0, 4));
}

const SEL_BALANCE_OF = selector("balanceOf(address)");
const SEL_DECIMALS = selector("decimals()");
const SEL_SYMBOL = selector("symbol()");
const SEL_TRANSFER = selector("transfer(address,uint256)");

/** ABI-encode a 20-byte address as a left-padded 32-byte word. */
function encodeAddress(address: Hex): Uint8Array {
  return bigintTo32Bytes(bytesToBigint(hexToBytes(address)));
}

export function encodeBalanceOf(owner: Hex): Hex {
  return add0x(strip0x(SEL_BALANCE_OF) + strip0x(bytesToHex(encodeAddress(owner))));
}

export function encodeDecimals(): Hex {
  return SEL_DECIMALS;
}

export function encodeSymbol(): Hex {
  return SEL_SYMBOL;
}

export function encodeTransfer(to: Hex, amount: bigint): Hex {
  const head = strip0x(SEL_TRANSFER);
  const toWord = strip0x(bytesToHex(encodeAddress(to)));
  const amountWord = strip0x(bytesToHex(bigintTo32Bytes(amount)));
  return add0x(head + toWord + amountWord);
}

/** Decode a single uint256 (or uint8) return value. */
export function decodeUint(data: Hex): bigint {
  const bytes = hexToBytes(data);
  if (bytes.length === 0) return 0n;
  return bytesToBigint(bytes);
}

/**
 * Decode an ABI-encoded `string` return value (offset, length, data).
 * Falls back to interpreting a bytes32-style symbol for non-standard tokens.
 */
export function decodeString(data: Hex): string {
  const bytes = hexToBytes(data);
  if (bytes.length === 0) return "";
  if (bytes.length === 32) {
    // Non-standard bytes32 symbol: trim trailing zeros, decode as UTF-8.
    return new TextDecoder().decode(trimZeros(bytes)).replace(/\u0000+$/, "").trim();
  }
  // Standard dynamic string: [0..32) offset, [offset..offset+32) length, then data.
  const offset = Number(bytesToBigint(bytes.slice(0, 32)));
  const length = Number(bytesToBigint(bytes.slice(offset, offset + 32)));
  const strBytes = bytes.slice(offset + 32, offset + 32 + length);
  return new TextDecoder().decode(strBytes);
}

function trimZeros(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytes.slice(0, end);
}

export const Erc20 = {
  SEL_BALANCE_OF,
  SEL_DECIMALS,
  SEL_SYMBOL,
  SEL_TRANSFER,
  encodeBalanceOf,
  encodeDecimals,
  encodeSymbol,
  encodeTransfer,
  decodeUint,
  decodeString,
  /** Re-export for callers building token configs. */
  normalizeAddress,
};
