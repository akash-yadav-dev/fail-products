// src/lib/security/image-validation.ts
/**
 * Server-side validation of an uploaded image (ADR-020, docs/SECURITY.md §7).
 *
 * Two rules drive everything here:
 *
 * 1. **Validate by magic bytes**, never by extension or the client's
 *    `Content-Type`. Both are attacker-controlled strings.
 * 2. **Never decode the image.** `sharp` cannot run on Workers, and the August
 *    2026 Next.js critical advisory was an unauthenticated RCE reached through
 *    AVIF decoding in the image optimizer. This reads a header prefix and
 *    nothing more.
 *
 * SVG is rejected outright: it is a stored-XSS vector, and rasterising it would
 * need exactly the decode step this design exists to avoid.
 */

/** MVP accepts raster images only (docs/SECURITY.md §7). */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** 5 MB. The browser resizes first, so anything larger did not come from our UI. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Enough for every signature below, including the ISO-BMFF brand at offset 8. */
const HEADER_BYTES = 16;

export type ImageValidationResult =
  | { ok: true; type: AllowedImageType }
  | { ok: false; reason: ImageRejectionReason };

export type ImageRejectionReason =
  | "empty"
  | "too-large"
  | "too-short"
  | "unrecognised-format";

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/** ASCII at a byte offset, for the ISO-BMFF box type and brand. */
function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

/**
 * The format a byte prefix actually is, or null.
 *
 * Signatures are from each format's own specification:
 * - JPEG  FF D8 FF
 * - PNG   89 50 4E 47 0D 0A 1A 0A
 * - GIF   "GIF87a" or "GIF89a"
 * - WebP  "RIFF" .... "WEBP"
 * - AVIF  ISO-BMFF: .... "ftyp" then an "avif"/"avis" brand
 */
export function detectImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  const first6 = ascii(bytes, 0, 6);
  if (first6 === "GIF87a" || first6 === "GIF89a") {
    return "image/gif";
  }

  // RIFF is a container; only the WEBP form counts.
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }

  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);

    if (brand === "avif" || brand === "avis") {
      return "image/avif";
    }
  }

  return null;
}

/**
 * Whether these bytes may be stored.
 *
 * `size` is the full byte length, which the caller knows before reading the
 * whole body — the cap is enforced without buffering a hostile upload.
 */
export function validateImageBytes(
  header: Uint8Array,
  size: number
): ImageValidationResult {
  if (size <= 0) {
    return { ok: false, reason: "empty" };
  }

  if (size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "too-large" };
  }

  if (header.length < HEADER_BYTES) {
    return { ok: false, reason: "too-short" };
  }

  const type = detectImageType(header);

  // Everything unrecognised lands here, SVG included: it is XML, so it has no
  // binary signature and can never match.
  return type ? { ok: true, type } : { ok: false, reason: "unrecognised-format" };
}

export const IMAGE_HEADER_BYTES = HEADER_BYTES;
