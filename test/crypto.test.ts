import test from "node:test";
import assert from "node:assert/strict";

import { keccak256Utf8 } from "../src/crypto/keccak.ts";
import { rlpEncode } from "../src/crypto/rlp.ts";
import { sign, recoverPublicKey, getPublicKey } from "../src/crypto/secp256k1.ts";
import { bytesToHex, hexToBytes, bytesToBigint } from "../src/crypto/hex.ts";

const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

test("keccak256 known vectors", () => {
  assert.equal(
    toHex(keccak256Utf8("")),
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  );
  assert.equal(
    toHex(keccak256Utf8("abc")),
    "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
  );
});

test("rlp encoding vectors", () => {
  assert.equal(bytesToHex(rlpEncode(new Uint8Array(0))), "0x80");
  assert.equal(bytesToHex(rlpEncode(Uint8Array.of(0))), "0x00");
  assert.equal(bytesToHex(rlpEncode(Buffer.from("dog"))), "0x83646f67");
  assert.equal(
    bytesToHex(rlpEncode([Buffer.from("cat"), Buffer.from("dog")])),
    "0xc88363617483646f67",
  );
});

test("secp256k1 sign produces canonical low-s and recovers signer", () => {
  const pk = "0x4646464646464646464646464646464646464646464646464646464646464646";
  const d = bytesToBigint(hexToBytes(pk));
  const msg = keccak256Utf8("pharos-pay");
  const sig = sign(msg, d);
  // low-s: s <= n/2
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  assert.ok(sig.s <= N / 2n, "signature must be low-s (EIP-2)");
  assert.ok(sig.recovery === 0 || sig.recovery === 1);
  // recovered pubkey matches signer
  assert.equal(toHex(recoverPublicKey(msg, sig)), toHex(getPublicKey(d)));
});

test("signing is deterministic (RFC 6979)", () => {
  const d = 12345678901234567890n;
  const msg = keccak256Utf8("determinism");
  const a = sign(msg, d);
  const b = sign(msg, d);
  assert.equal(a.r, b.r);
  assert.equal(a.s, b.s);
  assert.equal(a.recovery, b.recovery);
});
