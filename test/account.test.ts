import test from "node:test";
import assert from "node:assert/strict";

import {
  privateKeyToAddress,
  toChecksumAddress,
  normalizeAddress,
  isAddress,
} from "../src/chain/account.ts";

test("address derivation from private key", () => {
  assert.equal(
    privateKeyToAddress(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    ),
    "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  );
  assert.equal(
    privateKeyToAddress(
      "0x4646464646464646464646464646464646464646464646464646464646464646",
    ),
    "0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F",
  );
});

test("EIP-55 checksum", () => {
  assert.equal(
    toChecksumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"),
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  );
});

test("normalizeAddress accepts unchecksummed, rejects bad checksum", () => {
  const lower = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed";
  assert.equal(normalizeAddress(lower), "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  assert.throws(() => normalizeAddress("0x5aAeb6053f3E94C9b9A09f33669435E7Ef1BeAed"));
  assert.ok(isAddress(lower));
  assert.ok(!isAddress("0x123"));
});
