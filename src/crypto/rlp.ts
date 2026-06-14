/**
 * Recursive Length Prefix (RLP) encoding, per the Ethereum spec.
 * Zero dependencies. Encodes the structures needed for legacy (EIP-155)
 * transaction signing.
 */

import { concatBytes } from "./hex.ts";

export type RlpInput = Uint8Array | RlpInput[];

function encodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) {
    return Uint8Array.of(offset + len);
  }
  const hex = len.toString(16);
  const lenBytes = hexToByteArray(hex.length % 2 ? `0${hex}` : hex);
  return concatBytes(Uint8Array.of(offset + 55 + lenBytes.length), lenBytes);
}

function hexToByteArray(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function rlpEncode(input: RlpInput): Uint8Array {
  if (input instanceof Uint8Array) {
    // Single byte in [0x00, 0x7f] is its own encoding.
    if (input.length === 1 && input[0]! < 0x80) return input;
    return concatBytes(encodeLength(input.length, 0x80), input);
  }
  // List: concatenate encoded items, then prefix.
  const encodedItems = input.map(rlpEncode);
  const payload = concatBytes(...encodedItems);
  return concatBytes(encodeLength(payload.length, 0xc0), payload);
}
