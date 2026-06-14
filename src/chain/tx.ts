/**
 * Legacy (EIP-155) transaction construction and signing. Zero dependencies.
 *
 * Pharos is fully EVM-equivalent, so standard EIP-155 replay-protected legacy
 * transactions are accepted. Legacy transactions are deliberately chosen over
 * EIP-1559 here for maximum compatibility and a small, auditable serialization
 * path — important when the code is moving real value on behalf of an agent.
 */

import { keccak256 } from "../crypto/keccak.ts";
import { sign } from "../crypto/secp256k1.ts";
import { rlpEncode, type RlpInput } from "../crypto/rlp.ts";
import {
  type Hex,
  bytesToHex,
  hexToBytes,
  bigintToBytes,
  bytesToBigint,
} from "../crypto/hex.ts";

export interface LegacyTxParams {
  nonce: bigint;
  gasPrice: bigint;
  gasLimit: bigint;
  /** Recipient address, or null for contract creation. */
  to: Hex | null;
  value: bigint;
  data: Uint8Array;
  chainId: bigint;
}

export interface SignedTransaction {
  /** RLP-serialized signed transaction, ready for eth_sendRawTransaction. */
  raw: Hex;
  /** Transaction hash = keccak256(raw). */
  hash: Hex;
  v: bigint;
  r: Hex;
  s: Hex;
}

function toBytes(value: bigint): Uint8Array {
  return bigintToBytes(value);
}

function addressBytes(to: Hex | null): Uint8Array {
  return to === null ? new Uint8Array(0) : hexToBytes(to);
}

/** The fields hashed for signing (with EIP-155 chainId, 0, 0 suffix). */
function signingFields(tx: LegacyTxParams): RlpInput {
  return [
    toBytes(tx.nonce),
    toBytes(tx.gasPrice),
    toBytes(tx.gasLimit),
    addressBytes(tx.to),
    toBytes(tx.value),
    tx.data,
    toBytes(tx.chainId),
    toBytes(0n),
    toBytes(0n),
  ];
}

/** Keccak-256 hash that is actually signed for a legacy EIP-155 transaction. */
export function getSigningHash(tx: LegacyTxParams): Hex {
  return bytesToHex(keccak256(rlpEncode(signingFields(tx))));
}

/** Build and sign a legacy EIP-155 transaction with the given private key. */
export function signLegacyTransaction(
  tx: LegacyTxParams,
  privateKey: Hex,
): SignedTransaction {
  const d = bytesToBigint(hexToBytes(privateKey));
  const sigHash = hexToBytes(getSigningHash(tx));
  const sig = sign(sigHash, d);

  // EIP-155: v = recovery + chainId * 2 + 35
  const v = BigInt(sig.recovery) + tx.chainId * 2n + 35n;

  const signedFields: RlpInput = [
    toBytes(tx.nonce),
    toBytes(tx.gasPrice),
    toBytes(tx.gasLimit),
    addressBytes(tx.to),
    toBytes(tx.value),
    tx.data,
    toBytes(v),
    toBytes(sig.r),
    toBytes(sig.s),
  ];

  const raw = rlpEncode(signedFields);
  return {
    raw: bytesToHex(raw),
    hash: bytesToHex(keccak256(raw)),
    v,
    r: bytesToHex(toBytes(sig.r)),
    s: bytesToHex(toBytes(sig.s)),
  };
}
