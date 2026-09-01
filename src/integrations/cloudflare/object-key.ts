// src/integrations/cloudflare/object-key.ts
import type { AllowedImageType } from "@/lib/security/image-validation";

/**
 * R2 object keys, generated server-side from a CSPRNG.
 *
 * docs/SECURITY.md §7: "Generate object keys server-side from a CSPRNG. Never
 * interpolate a user filename into a key." A user filename in a key is a path
 * traversal, a content-type confusion, and a stored-XSS vector at once, and it
 * leaks whatever the uploader happened to call the file.
 *
 * The extension comes from the *detected* type, never from the upload's name.
 */

const EXTENSIONS: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/** What the object is for. Also the key prefix, so a listing is legible. */
export type ObjectScope = "product-logo" | "user-avatar";

/** 128 bits. Unguessable, and short enough to stay readable in a log line. */
const RANDOM_BYTES = 16;

function randomHex(byteLength: number): string {
  // Web Crypto, never Math.random (docs/SECURITY.md §2) and never node:crypto,
  // which does not exist on Workers.
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

/**
 * A key such as `product-logo/9f0c…a1/4b2e…7d.webp`.
 *
 * `ownerId` is a UUID this application generated, so it is safe in a key — it
 * groups an owner's objects for deletion without exposing anything a visitor
 * could not already read from a URL.
 */
export function createObjectKey(
  scope: ObjectScope,
  ownerId: string,
  type: AllowedImageType
): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ownerId)) {
    // A non-UUID owner id means the caller passed something user-controlled.
    throw new Error("createObjectKey needs a UUID owner id");
  }

  return `${scope}/${ownerId}/${randomHex(RANDOM_BYTES)}.${EXTENSIONS[type]}`;
}

export { EXTENSIONS as OBJECT_KEY_EXTENSIONS };
