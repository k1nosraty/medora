const limit = 8 * 1024 * 1024;
export const mediaIdPattern = /^[a-f0-9-]{36}$/;
const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length));

export function identify(bytes) {
  if (bytes.length < 16) return null;
  if (ascii(bytes, 0, 6).match(/^GIF8[79]a$/)) return "image/gif";
  if (ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 4) === "ftyp") return "video/mp4";
  return null;
}

export async function readMedia(request) {
  if (!request.body || Number(request.headers.get("Content-Length")) > limit) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const type = identify(bytes);
    return type ? { bytes, type } : null;
  } finally {
    reader.releaseLock();
  }
}

export function mediaResponse(meta, request, read, publicMedia) {
  if (!meta) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { type, size } = meta;
  const range = request.headers.get("Range");
  const headers = {
    "Content-Type": type, "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": publicMedia ? "public, max-age=30" : "private, no-store"
  };
  let first = 0, last = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match?.[1]) {
      first = Number(match[1]);
      if (match[2]) last = Math.min(last, Number(match[2]));
    } else if (match?.[2]) first = Math.max(0, size - Number(match[2]));
    else first = size;
    if (first > last || first >= size) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    headers["Content-Range"] = `bytes ${first}-${last}/${size}`;
  }
  headers["Content-Length"] = String(last - first + 1);
  return Promise.resolve(request.method === "HEAD" ? null : read(first, last)).then(body =>
    new Response(body, { status: range ? 206 : 200, headers }));
}
