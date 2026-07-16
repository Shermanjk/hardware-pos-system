import { randomBytes } from "crypto";

// ─── Character sets ───────────────────────────────────────────────────────────
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS    = "0123456789";
const ALL       = UPPERCASE + LOWERCASE + DIGITS;

/**
 * Returns a cryptographically secure random integer in [0, max).
 * Uses rejection sampling to avoid modulo bias.
 */
function secureRandInt(max: number): number {
  const limit = 256 - (256 % max);
  let value: number;
  do {
    value = randomBytes(1)[0];
  } while (value >= limit);
  return value % max;
}

/**
 * Fisher-Yates shuffle using crypto.randomBytes as the RNG source.
 */
function secureShuffle(arr: string[]): string[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates a cryptographically secure temporary password.
 *
 * Guarantees:
 *  - Length between 10 and 12 characters (inclusive)
 *  - At least one uppercase letter (A–Z)
 *  - At least one lowercase letter (a–z)
 *  - At least one digit (0–9)
 */
export function generateTempPassword(): string {
  const length = 10 + secureRandInt(3);

  // Guarantee one character from each required class
  const required: string[] = [
    UPPERCASE[secureRandInt(UPPERCASE.length)],
    LOWERCASE[secureRandInt(LOWERCASE.length)],
    DIGITS[secureRandInt(DIGITS.length)],
  ];

  const remaining: string[] = [];
  for (let i = required.length; i < length; i++) {
    remaining.push(ALL[secureRandInt(ALL.length)]);
  }

  return secureShuffle([...required, ...remaining]).join("");
}
