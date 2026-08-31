// src/lib/ids/uuid-v7.ts
/**
 * UUIDv7 generation (ADR-021).
 *
 * `crypto.randomUUID()` produces v4, whose randomness scatters B-tree inserts
 * and fragments the index on exactly the high-insert tables this schema has.
 * v7 puts a 48-bit millisecond timestamp in the high bits, so inserts stay
 * roughly sequential and rows sort by creation time for free.
 *
 * ADR-021 offered a Postgres-side default as the alternative. That would bind
 * the schema to a Postgres version whose availability on Neon nobody here has
 * verified; this is 20 lines, uses only Web Crypto, and runs on Workers.
 *
 * Layout — RFC 9562 §5.7:
 *
 *   0                   1                   2                   3
 *   |unix_ts_ms (48 bits)          |ver(4)|rand_a(12)|var(2)|rand_b(62)|
 */

/** Web Crypto, not `node:crypto` — this has to run on Workers. */
function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toHex(bytes: Uint8Array): string {
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

/**
 * A UUIDv7 as a canonical lowercase string.
 *
 * `timestamp` is injectable so the ordering guarantee can be tested without
 * sleeping; production callers pass nothing.
 */
export function uuidv7(timestamp: number = Date.now()): string {
  if (!Number.isInteger(timestamp) || timestamp < 0) {
    throw new Error(`uuidv7 needs a non-negative integer timestamp: ${timestamp}`);
  }

  const bytes = new Uint8Array(16);

  // Bytes 0-5: milliseconds since the Unix epoch, big-endian.
  // The 48-bit field overflows in the year 10889, which is not our problem.
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }

  bytes.set(randomBytes(10), 6);

  // Byte 6 high nibble: version 7. Byte 8 high bits: RFC 9562 variant (0b10).
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = toHex(bytes);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/** The millisecond timestamp encoded in a v7 identifier. */
export function uuidv7Timestamp(id: string): number {
  const hex = id.replace(/-/g, "").slice(0, 12);

  if (hex.length !== 12 || !/^[0-9a-f]{12}$/.test(hex)) {
    throw new Error(`Not a UUID: ${id}`);
  }

  return Number.parseInt(hex, 16);
}
