import bcrypt from "bcryptjs";

// 12 rounds is the common baseline for bcrypt in 2026 - expensive enough to
// resist offline cracking, cheap enough not to bottleneck sign-in.
const SALT_ROUNDS = 12;

export function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

export function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}
