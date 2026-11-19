import { AwsClient } from "aws4fetch";
export interface ObjectStorage {
  put(key: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  get(key: string): Promise<ArrayBuffer | null>;
  delete(key: string): Promise<void>;
}
export interface R2Bucket {
  put(key: string, data: ArrayBufferView): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<unknown>;
}
export function r2Storage(bucket: R2Bucket): ObjectStorage {
  return {
    async put(k, b) {
      await bucket.put(k, b);
    },
    async delete(k) {
      await bucket.delete(k);
    },
    async get(k) {
      return (await bucket.get(k))?.arrayBuffer() ?? null;
    },
  };
}
export function s3Storage(
  endpoint: string,
  bucket: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
): ObjectStorage & {
  initialize(): Promise<void>;
  listKeys(): AsyncGenerator<string>;
} {
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: "s3",
    retries: 2,
  });
  const base = endpoint.replace(/\/$/, "") + "/" + encodeURIComponent(bucket);
  const url = (key: string) =>
    base + "/" + key.split("/").map(encodeURIComponent).join("/");
  const request = (target: string | URL, options?: RequestInit) =>
    client.fetch(target, { ...options, redirect: "error", signal: AbortSignal.timeout(10_000) });
  return {
    async *listKeys() {
      const query = new URL(base);
      query.searchParams.set("list-type", "2");
      query.searchParams.set("encoding-type", "url");
      while (true) {
        const response = await request(query);
        if (!response.ok) throw Error("bucket_inventory_unavailable");
        const xml = await response.text();
        if (!xml.includes("<ListBucketResult"))
          throw Error("invalid_bucket_inventory");
        for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) {
          yield decodeURIComponent(match[1]!);
        }
        const truncated = xml.match(
          /<IsTruncated>(true|false)<\/IsTruncated>/,
        )?.[1];
        if (truncated === "false") return;
        const token = xml.match(
          /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/,
        )?.[1];
        if (truncated !== "true" || !token)
          throw Error("invalid_bucket_cursor");
        const next = token.replace(
          /&(amp|lt|gt|quot|apos);/g,
          (entity) =>
            ({
              "&amp;": "&",
              "&lt;": "<",
              "&gt;": ">",
              "&quot;": '"',
              "&apos;": "'",
            })[entity] ?? entity,
        );
        if (next === query.searchParams.get("continuation-token"))
          throw Error("repeated_bucket_cursor");
        query.searchParams.set("continuation-token", next);
      }
    },
    async initialize() {
      const head = await request(base, { method: "HEAD" });
      if (head.ok) return;
      if (head.status !== 404) throw new Error("bucket_unavailable");
      const r = await request(base, { method: "PUT" });
      if (!r.ok && r.status !== 409) throw new Error("bucket_create");
    },
    async put(key, bytes) {
      const r = await request(url(key), { method: "PUT", body: bytes });
      if (!r.ok) throw new Error("object_write");
    },
    async delete(key) {
      const r = await request(url(key), { method: "DELETE" });
      if (!r.ok && r.status !== 404) throw Error("object_delete");
    },
    async get(key) {
      const r = await request(url(key));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("object_read");
      return r.arrayBuffer();
    },
  };
}
