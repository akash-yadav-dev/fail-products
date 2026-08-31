// tests/unit/lib/security/image-validation.test.ts
import { describe, expect, it } from "vitest";

import {
  detectImageType,
  MAX_IMAGE_BYTES,
  validateImageBytes,
} from "@/lib/security/image-validation";

/**
 * ADR-020 and docs/SECURITY.md §7. The rules being asserted are that the
 * extension and the client's Content-Type never decide anything, and that SVG
 * can never be accepted.
 */

function header(...bytes: number[]): Uint8Array {
  // Padded to the 16 bytes the validator requires, so each test states only
  // the signature it cares about.
  const buffer = new Uint8Array(16);
  buffer.set(bytes.slice(0, 16));
  return buffer;
}

function ascii(text: string, offset = 0): Uint8Array {
  const buffer = new Uint8Array(16);
  for (let i = 0; i < text.length && offset + i < 16; i += 1) {
    buffer[offset + i] = text.charCodeAt(i);
  }
  return buffer;
}

const JPEG = header(0xff, 0xd8, 0xff, 0xe0);
const PNG = header(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const GIF89A = ascii("GIF89a");
const GIF87A = ascii("GIF87a");

function riff(brand: string): Uint8Array {
  const buffer = ascii("RIFF");
  for (let i = 0; i < 4; i += 1) {
    buffer[8 + i] = brand.charCodeAt(i);
  }
  return buffer;
}

function isoBmff(brand: string): Uint8Array {
  const buffer = ascii("ftyp", 4);
  for (let i = 0; i < 4; i += 1) {
    buffer[8 + i] = brand.charCodeAt(i);
  }
  return buffer;
}

describe("detectImageType", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["GIF89a", GIF89A, "image/gif"],
    ["GIF87a", GIF87A, "image/gif"],
    ["WebP", riff("WEBP"), "image/webp"],
    ["AVIF", isoBmff("avif"), "image/avif"],
    ["AVIF sequence", isoBmff("avis"), "image/avif"],
  ])("recognises %s", (_name, bytes, expected) => {
    expect(detectImageType(bytes)).toBe(expected);
  });

  it("rejects a RIFF container that is not WebP", () => {
    // A WAV file also starts "RIFF"; only the WEBP form is an image.
    expect(detectImageType(riff("WAVE"))).toBeNull();
  });

  it("rejects an ISO-BMFF file that is not AVIF", () => {
    // An MP4 shares the ftyp box. It is not a raster image.
    expect(detectImageType(isoBmff("mp42"))).toBeNull();
  });

  it("rejects SVG", () => {
    // The whole point: SVG is XML, has no binary signature, and is a stored-XSS
    // vector. It must never match, however it is labelled.
    expect(detectImageType(ascii("<svg xmlns="))).toBeNull();
  });

  it("rejects SVG with an XML declaration", () => {
    expect(detectImageType(ascii("<?xml versio"))).toBeNull();
  });

  it("rejects HTML", () => {
    expect(detectImageType(ascii("<!DOCTYPE ht"))).toBeNull();
  });

  it("rejects a zip, which is what a disguised archive looks like", () => {
    expect(detectImageType(header(0x50, 0x4b, 0x03, 0x04))).toBeNull();
  });

  it("rejects an all-zero header", () => {
    expect(detectImageType(new Uint8Array(16))).toBeNull();
  });
});

describe("validateImageBytes", () => {
  it("accepts a PNG within the size cap", () => {
    expect(validateImageBytes(PNG, 1024)).toEqual({
      ok: true,
      type: "image/png",
    });
  });

  it("accepts a file of exactly the maximum size", () => {
    expect(validateImageBytes(PNG, MAX_IMAGE_BYTES)).toEqual({
      ok: true,
      type: "image/png",
    });
  });

  it("rejects one byte over the maximum", () => {
    // The cap is enforced server-side; client-side resizing can be bypassed.
    expect(validateImageBytes(PNG, MAX_IMAGE_BYTES + 1)).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("rejects an empty upload", () => {
    expect(validateImageBytes(PNG, 0)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a negative size", () => {
    expect(validateImageBytes(PNG, -1)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a header too short to identify", () => {
    expect(validateImageBytes(new Uint8Array([0xff, 0xd8]), 1024)).toEqual({
      ok: false,
      reason: "too-short",
    });
  });

  it("rejects an unrecognised format", () => {
    expect(validateImageBytes(ascii("<svg xmlns="), 1024)).toEqual({
      ok: false,
      reason: "unrecognised-format",
    });
  });

  it("checks the size before reading the header", () => {
    // An oversized upload is rejected without inspecting attacker-controlled
    // bytes at all.
    expect(
      validateImageBytes(new Uint8Array(0), MAX_IMAGE_BYTES + 1)
    ).toEqual({ ok: false, reason: "too-large" });
  });
});
