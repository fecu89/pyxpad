import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "dotenv";
import {
  createEmailLookup,
  decryptUserPii,
  encryptUserPii,
} from "../lib/security/pii-crypto-core";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const userId = randomUUID();
const anotherUserId = randomUUID();
const email = "Teacher@Example.com";
const first = encryptUserPii(userId, "email", email);
const second = encryptUserPii(userId, "email", email);

assert.notEqual(first, second, "무작위 IV 때문에 같은 원문도 다른 암호문이어야 합니다.");
assert.equal(decryptUserPii(userId, "email", first), email);
assert.throws(() => decryptUserPii(anotherUserId, "email", first), /복호화/);
assert.equal(createEmailLookup(" Teacher@Example.com "), createEmailLookup("teacher@example.com"));
assert.notEqual(createEmailLookup("teacher@example.com"), createEmailLookup("student@example.com"));

const tampered = first.split(":");
tampered[3] = `${tampered[3][0] === "A" ? "B" : "A"}${tampered[3].slice(1)}`;
assert.throws(() => decryptUserPii(userId, "email", tampered.join(":")), /복호화/);

const originalKeyId = process.env.PII_ACTIVE_KEY_ID;
assert.ok(originalKeyId, "PII_ACTIVE_KEY_ID가 필요합니다.");
const oldKeyEnvironment = "PII_ENCRYPTION_KEY_ROTATION_TEST";
process.env[oldKeyEnvironment] = randomBytes(32).toString("base64");
process.env.PII_ACTIVE_KEY_ID = "rotation_test";
const oldCiphertext = encryptUserPii(userId, "name", "키 회전 테스트");
process.env.PII_ACTIVE_KEY_ID = originalKeyId;
assert.equal(decryptUserPii(userId, "name", oldCiphertext), "키 회전 테스트");
delete process.env[oldKeyEnvironment];

console.log("pii_crypto_tests=passed");
