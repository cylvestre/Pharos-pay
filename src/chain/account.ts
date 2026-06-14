/**
 * Ethereum/Pharos account utilities: address derivation, EIP-55 checksum,
 * and address validation. Zero dependencies.
 */

import { keccak256 } from "../crypto/keccak.ts";
import { getPublicKey } from "../crypto/secp256k1.ts";
import {
  type Hex,
  bytesToHex,
  hexToBytes,
  strip0x,
  bytesToBigint,
  utf8ToBytes,
} from "../crypto/hex.ts";

/** Derive the 20-byte address (EIP-55 checksummed) from a 64-byte public key. */
export function publicKeyToAddress(publicKey: Uint8Array): Hex {
  if (publicKey.length !== 64) throw new Error("public key must be 64 bytes (x||y)");
  const hash = keccak256(publicKey);
  const addressBytes = hash.slice(12); // last 20 bytes
  return toChecksumAddress(bytesToHex(addressBytes));
}

/** Derive the checksummed address from a private key. */
export function privateKeyToAddress(privateKey: Hex): Hex {
  const d = bytesToBigint(hexToBytes(privateKey));
  const pub = getPublicKey(d);
  return publicKeyToAddress(pub);
}

/** Apply EIP-55 mixed-case checksum to a 20-byte hex address. */
export function toChecksumAddress(address: string): Hex {
  const lower = strip0x(address).toLowerCase();
  if (lower.length !== 40) throw new Error(`invalid address length: ${address}`);
  const hash = keccak256(utf8ToBytes(lower));
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    const nibble = (hash[Math.floor(i / 2)]! >> (i % 2 === 0 ? 4 : 0)) & 0x0f;
    const char = lower[i]!;
    out += nibble >= 8 ? char.toUpperCase() : char;
  }
  return out as Hex;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value: unknown): value is Hex {
  return typeof value === "string" && ADDRESS_RE.test(value);
}

/**
 * Validate an address and return it checksummed. Rejects mixed-case addresses
 * whose checksum does not verify (all-lower / all-upper are accepted as
 * "no checksum provided").
 */
export function normalizeAddress(address: string): Hex {
  if (!isAddress(address)) throw new Error(`invalid address: ${address}`);
  const body = strip0x(address);
  const isMixedCase = body !== body.toLowerCase() && body !== body.toUpperCase();
  const checksummed = toChecksumAddress(address);
  // If the caller supplied a mixed-case address, treat it as checksummed and
  // reject it when the checksum does not verify. All-lower / all-upper inputs
  // are accepted as "unchecksummed".
  if (isMixedCase && checksummed !== `0x${body}`) {
    throw new Error(`bad address checksum: ${address}`);
  }
  return checksummed;
}
