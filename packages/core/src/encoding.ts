import { decodeBase64urlIgnorePadding, encodeBase64urlNoPadding } from "@oslojs/encoding";

export function base64UrlEncode(bytes: Uint8Array): string {
  return encodeBase64urlNoPadding(bytes);
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const bytes = decodeBase64urlIgnorePadding(value);
  const buffer: ArrayBuffer = new ArrayBuffer(bytes.byteLength);
  const copy = new Uint8Array(buffer);
  copy.set(bytes);
  return copy;
}

export function utf8Encode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
