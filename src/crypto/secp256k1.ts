/**
 * Minimal secp256k1 ECDSA implementation in pure TypeScript (zero deps),
 * scoped to exactly what Ethereum-style transaction signing needs:
 *
 *   - private key -> public key (uncompressed)
 *   - deterministic ECDSA signing per RFC 6979 (HMAC-SHA256)
 *   - canonical low-s signatures (EIP-2)
 *   - recovery id (v) computation
 *   - public key recovery (used to derive `v` and to self-verify)
 *
 * This is intentionally small and auditable rather than a general-purpose
 * crypto library. HMAC-SHA256 is taken from Node's `crypto` (a standard,
 * non-Ethereum-specific primitive); all curve math is implemented here.
 */

import { createHmac } from "node:crypto";
import { bytesToBigint, bigintTo32Bytes, concatBytes } from "./hex.ts";

// Curve parameters for secp256k1: y^2 = x^3 + 7 over F_p.
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const A = 0n;
const B = 7n;
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

export const CURVE_N = N;

interface Point {
  x: bigint;
  y: bigint;
}
// Point at infinity is represented as null.
type JPoint = Point | null;

const G: Point = { x: Gx, y: Gy };

function mod(a: bigint, m: bigint = P): bigint {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

/** Modular inverse via extended Euclid. */
function invMod(a: bigint, m: bigint): bigint {
  let [old_r, r] = [mod(a, m), m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  if (old_r !== 1n) throw new Error("not invertible");
  return mod(old_s, m);
}

function pointAdd(p: JPoint, q: JPoint): JPoint {
  if (p === null) return q;
  if (q === null) return p;
  if (p.x === q.x && mod(p.y + q.y) === 0n) return null; // p + (-p)
  let lam: bigint;
  if (p.x === q.x && p.y === q.y) {
    // doubling
    lam = mod((3n * p.x * p.x + A) * invMod(2n * p.y, P));
  } else {
    lam = mod((q.y - p.y) * invMod(q.x - p.x, P));
  }
  const x = mod(lam * lam - p.x - q.x);
  const y = mod(lam * (p.x - x) - p.y);
  return { x, y };
}

function scalarMul(k: bigint, point: JPoint): JPoint {
  let result: JPoint = null;
  let addend = point;
  let n = mod(k, N);
  while (n > 0n) {
    if (n & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    n >>= 1n;
  }
  return result;
}

/** Is a private key in the valid range [1, N-1]? */
export function isValidPrivateKey(d: bigint): boolean {
  return d > 0n && d < N;
}

/**
 * Public key as 64 raw bytes (x || y), i.e. the uncompressed key without the
 * 0x04 prefix. This is the form Ethereum hashes to derive an address.
 */
export function getPublicKey(privateKey: bigint): Uint8Array {
  if (!isValidPrivateKey(privateKey)) throw new Error("invalid private key");
  const pub = scalarMul(privateKey, G);
  if (pub === null) throw new Error("invalid public key (infinity)");
  return concatBytes(bigintTo32Bytes(pub.x), bigintTo32Bytes(pub.y));
}

export interface Signature {
  r: bigint;
  s: bigint;
  /** Recovery id, 0 or 1 (NOT yet offset by 27 or EIP-155). */
  recovery: number;
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return new Uint8Array(createHmac("sha256", key).update(data).digest());
}

/**
 * RFC 6979 deterministic nonce generation (k) using HMAC-SHA256.
 * Yields candidate k values until the caller accepts one.
 */
function* rfc6979(hash: Uint8Array, privateKey: bigint): Generator<bigint> {
  const x = bigintTo32Bytes(privateKey);
  const h1 = hash; // already 32 bytes (a message hash)
  let v = new Uint8Array(32).fill(0x01);
  let k = new Uint8Array(32).fill(0x00);

  k = hmacSha256(k, concatBytes(v, Uint8Array.of(0x00), x, h1));
  v = hmacSha256(k, v);
  k = hmacSha256(k, concatBytes(v, Uint8Array.of(0x01), x, h1));
  v = hmacSha256(k, v);

  while (true) {
    v = hmacSha256(k, v);
    const candidate = bytesToBigint(v);
    if (candidate >= 1n && candidate < N) yield candidate;
    k = hmacSha256(k, concatBytes(v, Uint8Array.of(0x00)));
    v = hmacSha256(k, v);
  }
}

/**
 * Sign a 32-byte message hash. Produces a canonical (low-s) signature with a
 * recovery id, suitable for Ethereum-style transactions.
 */
export function sign(messageHash: Uint8Array, privateKey: bigint): Signature {
  if (messageHash.length !== 32) throw new Error("message hash must be 32 bytes");
  if (!isValidPrivateKey(privateKey)) throw new Error("invalid private key");
  const z = bytesToBigint(messageHash);

  for (const k of rfc6979(messageHash, privateKey)) {
    const kp = scalarMul(k, G);
    if (kp === null) continue;
    const r = mod(kp.x, N);
    if (r === 0n) continue;

    const kInv = invMod(k, N);
    let s = mod(kInv * (z + r * privateKey), N);
    if (s === 0n) continue;

    // Recovery id parity comes from kp.y (and a potential reduction of r mod N).
    let recovery = (kp.y & 1n ? 1 : 0) | (kp.x !== r ? 2 : 0);

    // Enforce low-s (EIP-2); flipping s flips the y-parity, hence recovery bit 0.
    if (s > N / 2n) {
      s = N - s;
      recovery ^= 1;
    }
    return { r, s, recovery };
  }
  throw new Error("failed to produce signature");
}

/** Decompress a curve point from x and a y-parity bit. */
function liftX(x: bigint, yParity: number): Point {
  const ySq = mod(x * x * x + A * x + B);
  // sqrt via p = 3 mod 4: y = ySq^((p+1)/4)
  const y = powMod(ySq, (P + 1n) / 4n, P);
  const finalY = (y & 1n) === BigInt(yParity) ? y : mod(-y);
  return { x, y: finalY };
}

function powMod(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b, m);
    b = mod(b * b, m);
    e >>= 1n;
  }
  return result;
}

/**
 * Recover the 64-byte public key (x || y) from a signature and message hash.
 * Used to determine `v` against a known signer and to self-verify signatures.
 */
export function recoverPublicKey(
  messageHash: Uint8Array,
  sig: Signature,
): Uint8Array {
  const { r, s, recovery } = sig;
  if (r <= 0n || r >= N || s <= 0n || s >= N) throw new Error("invalid signature");
  const z = bytesToBigint(messageHash);

  const x = (recovery & 2) !== 0 ? r + N : r;
  if (x >= P) throw new Error("invalid recovery x");
  const R = liftX(x, recovery & 1);

  const rInv = invMod(r, N);
  // Q = r^-1 * (s*R - z*G)
  const sR = scalarMul(s, R);
  const zG = scalarMul(z, G);
  const negZG = zG === null ? null : { x: zG.x, y: mod(-zG.y) };
  const sum = pointAdd(sR, negZG);
  const Q = scalarMul(rInv, sum);
  if (Q === null) throw new Error("recovery produced infinity");
  return concatBytes(bigintTo32Bytes(Q.x), bigintTo32Bytes(Q.y));
}
