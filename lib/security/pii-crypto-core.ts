import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

export type UserPiiField = "email" | "name" | "image";

const FORMAT_VERSION = "v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`);
  return value;
}

function decodeKey(value: string, name: string) {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error(`${name}은 base64로 인코딩한 32바이트 키여야 합니다.`);
  return key;
}

function activeKeyId() {
  const keyId = requireEnvironment("PII_ACTIVE_KEY_ID");
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId)) throw new Error("PII_ACTIVE_KEY_ID 형식이 올바르지 않습니다.");
  return keyId;
}

function encryptionKey(keyId: string) {
  const environmentName = `PII_ENCRYPTION_KEY_${keyId.toUpperCase()}`;
  return decodeKey(requireEnvironment(environmentName), environmentName);
}

function associatedData(userId: string, field: UserPiiField) {
  return Buffer.from(`User:${userId}:${field}`, "utf8");
}

export function normalizeEmail(email: string) {
  return email.trim().normalize("NFKC").toLowerCase();
}

export function createEmailLookup(email: string) {
  const lookupKey = decodeKey(requireEnvironment("PII_LOOKUP_KEY"), "PII_LOOKUP_KEY");
  return createHmac("sha256", lookupKey).update(normalizeEmail(email), "utf8").digest("base64url");
}

export function encryptUserPii(userId: string, field: UserPiiField, value: string) {
  const keyId = activeKeyId();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyId), iv, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(associatedData(userId, field));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, keyId, iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(":");
}

export function encryptOptionalUserPii(userId: string, field: UserPiiField, value: string | null | undefined) {
  return value ? encryptUserPii(userId, field, value) : null;
}

export function decryptUserPii(userId: string, field: UserPiiField, payload: string) {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) throw new Error("지원하지 않는 개인정보 암호문 형식입니다.");
  const [, keyId, ivValue, encryptedValue, tagValue] = parts;
  const iv = Buffer.from(ivValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) throw new Error("개인정보 암호문 형식이 올바르지 않습니다.");

  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyId), iv, { authTagLength: AUTH_TAG_BYTES });
    decipher.setAAD(associatedData(userId, field));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("개인정보를 복호화하지 못했습니다.");
  }
}

export function decryptOptionalUserPii(userId: string, field: UserPiiField, payload: string | null | undefined) {
  return payload ? decryptUserPii(userId, field, payload) : null;
}

export function maskEmail(email: string) {
  const separator = email.lastIndexOf("@");
  if (separator <= 0) return "***";
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
