import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";

export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const randomToken = (bytes = 32) =>
  randomBytes(bytes).toString("base64url");
export const normalizeInvite = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-ZА-ЯЁ0-9-]/g, "");
export const hashPassword = (value: string) =>
  argon2.hash(value, { type: argon2.argon2id });
export const verifyPassword = (hash: string, value: string) =>
  argon2.verify(hash, value);
