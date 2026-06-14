import test from "node:test";
import assert from "node:assert/strict";

import { Erc20, encodeTransfer, decodeUint, decodeString } from "../src/chain/erc20.ts";
import { bigintTo32Bytes, bytesToHex } from "../src/crypto/hex.ts";

test("ERC-20 function selectors match canonical values", () => {
  assert.equal(Erc20.SEL_BALANCE_OF, "0x70a08231");
  assert.equal(Erc20.SEL_TRANSFER, "0xa9059cbb");
  assert.equal(Erc20.SEL_DECIMALS, "0x313ce567");
  assert.equal(Erc20.SEL_SYMBOL, "0x95d89b41");
});

test("encodeTransfer ABI layout", () => {
  const data = encodeTransfer(
    "0x3535353535353535353535353535353535353535",
    1_000_000_000_000_000_000n,
  );
  assert.equal(
    data,
    "0xa9059cbb" +
      "0000000000000000000000003535353535353535353535353535353535353535" +
      "0000000000000000000000000000000000000000000000000de0b6b3a7640000",
  );
});

test("decodeUint", () => {
  assert.equal(decodeUint(bytesToHex(bigintTo32Bytes(12_345_678n))), 12_345_678n);
  assert.equal(decodeUint("0x"), 0n);
});

test("decodeString handles dynamic string return", () => {
  // offset=0x20, length=4, "USDC"
  const data =
    "0x" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    "0000000000000000000000000000000000000000000000000000000000000004" +
    "5553444300000000000000000000000000000000000000000000000000000000";
  assert.equal(decodeString(data as `0x${string}`), "USDC");
});
