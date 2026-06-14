import test from "node:test";
import assert from "node:assert/strict";

import { signLegacyTransaction, getSigningHash } from "../src/chain/tx.ts";

// The canonical EIP-155 example transaction from the spec.
const EIP155_TX = {
  nonce: 9n,
  gasPrice: 20_000_000_000n,
  gasLimit: 21_000n,
  to: "0x3535353535353535353535353535353535353535" as const,
  value: 1_000_000_000_000_000_000n,
  data: new Uint8Array(0),
  chainId: 1n,
};
const EIP155_KEY =
  "0x4646464646464646464646464646464646464646464646464646464646464646";

test("EIP-155 signing hash matches the spec", () => {
  assert.equal(
    getSigningHash(EIP155_TX),
    "0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53",
  );
});

test("EIP-155 signed transaction is byte-exact with the spec vector", () => {
  const signed = signLegacyTransaction(EIP155_TX, EIP155_KEY);
  assert.equal(signed.v, 37n);
  assert.equal(
    signed.raw,
    "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83",
  );
});

test("chainId affects v (replay protection)", () => {
  const onPharos = signLegacyTransaction({ ...EIP155_TX, chainId: 688688n }, EIP155_KEY);
  // v = recovery + chainId*2 + 35
  assert.ok(onPharos.v === 688688n * 2n + 35n || onPharos.v === 688688n * 2n + 36n);
});
