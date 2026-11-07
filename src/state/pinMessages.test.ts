import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VaultError } from "../lib/vault/vault.ts";
import { PIN_STRINGS, isPermanentUnlockError, pinErrorMessage } from "./pinMessages.ts";

describe("PIN error messages", () => {
  it("maps each vault error code to its constant message", () => {
    const cases: [string, string][] = [
      ["INVALID_PIN", PIN_STRINGS.errInvalidPin],
      ["PINS_NOT_DISTINCT", PIN_STRINGS.setupSameAsFirst],
      ["UNSUPPORTED_FORMAT", PIN_STRINGS.errUnsupported],
      ["DEVICE_SECRET_MISSING", PIN_STRINGS.errDeviceKeyMissing],
      ["KDF_UNAVAILABLE", PIN_STRINGS.errUnavailable],
      ["NOT_INITIALIZED", PIN_STRINGS.errNotSetUp],
      ["ALREADY_INITIALIZED", PIN_STRINGS.errNotSetUp],
      ["CORRUPT", PIN_STRINGS.errGeneric],
    ];
    for (const [code, message] of cases) {
      assert.equal(pinErrorMessage(new VaultError(code as never, "internal detail 123456")), message, code);
    }
  });

  it("never passes an error's own text through", () => {
    for (const e of [new Error("path /data/user/0/x/secret.pdf"), "123456", null, undefined, { code: 42 }]) {
      assert.equal(pinErrorMessage(e), PIN_STRINGS.errGeneric);
    }
  });

  it("keypad is disabled only for errors a retry can't fix", () => {
    assert.equal(isPermanentUnlockError(new VaultError("KDF_UNAVAILABLE", "")), true);
    assert.equal(isPermanentUnlockError(new VaultError("UNSUPPORTED_FORMAT", "")), true);
    assert.equal(isPermanentUnlockError(new VaultError("DEVICE_SECRET_MISSING", "")), true);
    assert.equal(isPermanentUnlockError(new VaultError("NOT_INITIALIZED", "")), true);
    assert.equal(isPermanentUnlockError(new VaultError("INVALID_PIN", "")), false);
    assert.equal(isPermanentUnlockError(new Error("x")), false);
  });

  it("visible strings avoid the banned words", () => {
    for (const s of Object.values(PIN_STRINGS)) {
      assert.doesNotMatch(s, /encrypt|secure|report/i, s);
    }
  });
});
