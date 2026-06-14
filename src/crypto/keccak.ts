/**
 * Keccak-256 (the hash used by Ethereum / Pharos), implemented in pure
 * TypeScript with zero dependencies.
 *
 * NOTE: This is original Keccak with `0x01` domain padding, which differs from
 * NIST SHA3-256 (`0x06` padding) available in Node's `crypto`. They are NOT
 * interchangeable for Ethereum addresses or signing hashes.
 *
 * Lanes are represented as 64-bit `bigint`s. Inputs in this Skill are small
 * (addresses, ~100-byte transactions), so BigInt performance is a non-issue and
 * correctness is far easier to audit than a 32-bit hi/lo split.
 */

import { utf8ToBytes } from "./hex.ts";

const MASK64 = (1n << 64n) - 1n;

// Keccak round constants (24 rounds).
const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rotation offsets (rho step), indexed by lane position x + 5*y.
const ROT: number[] = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

function rotl64(value: bigint, n: number): bigint {
  const s = BigInt(n);
  return ((value << s) | (value >> (64n - s))) & MASK64;
}

function keccakF1600(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // Theta
    const C = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) {
      C[x] = state[x]! ^ state[x + 5]! ^ state[x + 10]! ^ state[x + 15]! ^ state[x + 20]!;
    }
    const D = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5]! ^ rotl64(C[(x + 1) % 5]!, 1);
    }
    for (let i = 0; i < 25; i++) state[i] = state[i]! ^ D[i % 5]!;

    // Rho + Pi
    const B = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const idx = x + 5 * y;
        const newX = y;
        const newY = (2 * x + 3 * y) % 5;
        B[newX + 5 * newY] = rotl64(state[idx]!, ROT[idx]!);
      }
    }

    // Chi
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const idx = x + 5 * y;
        state[idx] = B[idx]! ^ (~B[((x + 1) % 5) + 5 * y]! & B[((x + 2) % 5) + 5 * y]!) & MASK64;
      }
    }

    // Iota
    state[0] = state[0]! ^ RC[round]!;
  }
}

/**
 * Keccak-256 over raw bytes. Rate = 136 bytes (1088 bits), capacity = 512 bits,
 * output = 32 bytes, multi-rate padding with domain byte 0x01.
 */
export function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136;
  const state = new Array<bigint>(25).fill(0n);

  // Absorb full + final padded block.
  const padded = padInput(input, rate);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 0; b < 8; b++) {
        lane |= BigInt(padded[offset + i * 8 + b]!) << BigInt(8 * b);
      }
      state[i] = state[i]! ^ lane;
    }
    keccakF1600(state);
  }

  // Squeeze first 32 bytes (fits within the rate, single squeeze).
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i]!;
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

function padInput(input: Uint8Array, rate: number): Uint8Array {
  const padLen = rate - (input.length % rate);
  const padded = new Uint8Array(input.length + padLen);
  padded.set(input, 0);
  // Multi-rate padding: append 0x01, zeros, then 0x80 on the last byte.
  padded[input.length] = 0x01;
  padded[padded.length - 1] ^= 0x80;
  return padded;
}

/** Convenience: Keccak-256 of a UTF-8 string. */
export function keccak256Utf8(text: string): Uint8Array {
  return keccak256(utf8ToBytes(text));
}
