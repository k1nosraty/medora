import { AwsClient } from "aws4fetch";
export interface ObjectStorage {
  put(key: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  get(key: string): Promise<ArrayBuffer | null>;
}
export interface R2Bucket {
  put(key: string, data: ArrayBufferView): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}
export function r2Storage(bucket: R2Bucket): ObjectStorage {
  return {
    async put(k, b) {
      await bucket.put(k, b);
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
): ObjectStorage & { initialize(): Promise<void> } {
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
  return {
    async initialize() {
      const head = await client.fetch(base, { method: "HEAD" });
      if (head.ok) return;
      if (head.status !== 404) throw new Error("bucket_unavailable");
      const r = await client.fetch(base, { method: "PUT" });
      if (!r.ok && r.status !== 409) throw new Error("bucket_create");
    },
    async put(key, bytes) {
      const r = await client.fetch(url(key), { method: "PUT", body: bytes });
      if (!r.ok) throw new Error("object_write");
    },
    async get(key) {
      const r = await client.fetch(url(key));
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("object_read");
      return r.arrayBuffer();
    },
  };
}
