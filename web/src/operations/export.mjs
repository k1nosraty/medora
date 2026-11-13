const encoder = new TextEncoder();

export function exportResponse({ promotion, credentials, store }) {
  async function* records() {
    yield { type: "manifest", version: 1, exportedAt: new Date().toISOString(),
      excludes: ["passwords_and_hashes", "sessions", "push_subscriptions", "secrets", "device_health_records"] };
    const { assets, ...campaigns } = await promotion.exportData();
    yield { type: "promotions", ...campaigns };
    for (const asset of assets) {
      yield { type: "media", ...asset };
      const block = 96 * 1024;
      for (let first = 0; first < asset.size; first += block) {
        const bytes = await promotion.mediaBytes(asset.id, first, Math.min(asset.size - 1, first + block - 1));
        const data = Array.from({ length: Math.ceil(bytes.length / 3072) }, (_, i) =>
          btoa(String.fromCharCode(...bytes.subarray(i * 3072, (i + 1) * 3072)))).join("");
        yield { type: "media_chunk", id: asset.id, offset: first, data };
      }
    }
    let cursor = "";
    while (true) {
      const rows = await credentials.exportAccounts(cursor);
      if (!rows.length) break;
      yield { type: "accounts", rows };
      cursor = rows.at(-1).username;
    }
    yield { type: "operations", ...await store.exportData() };
    yield { type: "end" };
  }
  const iterator = records();
  return new Response(new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
    },
    async cancel() { await iterator.return(); }
  }), { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Content-Disposition": 'attachment; filename="medora-server-data.ndjson"' } });
}
