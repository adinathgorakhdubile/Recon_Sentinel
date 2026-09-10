/** SHA-256 hashing utilities backed by SubtleCrypto. */

export async function sha256OfBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return sha256OfBuffer(buf);
}

export async function sha256OfBuffer(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256OfString(s: string): Promise<string> {
  const enc = new TextEncoder();
  return sha256OfBuffer(enc.encode(s).buffer);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    out += h.length === 1 ? "0" + h : h;
  }
  return out;
}
