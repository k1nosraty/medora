import { activeAt } from "./http.mjs";
export const chunkSize = 128 * 1024;
const campaignKeys = ["campaigns", "promotion"];

function campaignRows(values) {
  const legacy = values.get("promotion");
  return values.get("campaigns") || (legacy ? [legacy] : []);
}

async function mediaReferences(storage) {
  const values = await storage.get([...campaignKeys, "assets", "preview"]);
  return {
    assets: values.get("assets") ?? [],
    rows: campaignRows(values),
    preview: values.get("preview"),
  };
}

export class CampaignStore {
  constructor(storage) {
    this.storage = storage;
  }
  async campaigns(storage = this.storage) {
    return campaignRows(await storage.get(campaignKeys));
  }

  async current() {
    const rows = await this.campaigns();
    const now = Date.now();
    const current = rows.find((row) => activeAt(row, now)) ?? null;
    const times = rows
      .filter((row) => row.enabled && !row.archived)
      .flatMap((row) => [row.startsAt, row.endsAt])
      .filter((time) => time > now);
    return {
      current,
      ttl: Math.min(60, Math.floor((Math.min(...times) - now) / 1000)),
    };
  }

  async dashboard(id) {
    const campaigns = await this.campaigns();
    const counters = campaigns.length
      ? await this.storage.get(campaigns.map((row) => "count:" + row.id))
      : new Map();
    const rows = campaigns.map((row) => ({
      ...row,
      stats: counters.get("count:" + row.id) ?? { impression: 0, click: 0 },
    }));
    return {
      promotion: (id ? rows.find((row) => row.id === id) : rows[0]) ?? null,
      campaigns: rows,
    };
  }

  async save(row, id, archived, create) {
    return this.storage.transaction(async (storage) => {
      const rows = await this.campaigns(storage);
      const previous = create
        ? null
        : id
          ? rows.find((entry) => entry.id === id)
          : rows[0];
      if (
        (id && !previous) ||
        (!previous && rows.length >= 40) ||
        !(await this.validMedia(row, storage))
      )
        return null;
      const same =
        previous &&
        [
          "title",
          "description",
          "url",
          "mediaType",
          "mediaUrl",
          "mediaId",
          "linkLabel",
        ].every((key) => (previous[key] ?? "") === row[key]);
      const current = {
        ...row,
        enabled: row.enabled && !archived,
        archived,
        id: previous?.id ?? crypto.randomUUID(),
        creativeId: same
          ? (previous.creativeId ?? previous.id)
          : crypto.randomUUID(),
      };
      const next = [
        current,
        ...rows.filter((entry) => entry.id !== previous?.id),
      ];
      await storage.put("campaigns", next);
      return current;
    });
  }

  async count(id, event) {
    await this.storage.transaction(async (storage) => {
      if (
        !(await this.campaigns(storage)).some(
          (row) => row.id === id && activeAt(row, Date.now()),
        )
      )
        return;
      const key = "count:" + id;
      const stats = (await storage.get(key)) ?? { impression: 0, click: 0 };
      stats[event]++;
      await storage.put(key, stats);
    });
  }

  async removeArchived(id) {
    return this.storage.transaction(async (storage) => {
      const rows = await this.campaigns(storage);
      if (!rows.some((row) => row.id === id && row.archived)) return false;
      await storage.put(
        "campaigns",
        rows.filter((row) => row.id !== id),
      );
      await storage.delete("count:" + id);
      return true;
    });
  }

  preview() {
    return this.storage.get("preview");
  }
  savePreview(row) {
    return this.storage.transaction(async (storage) => {
      if (!(await this.validMedia(row, storage))) return false;
      await storage.put("preview", { ...row, enabled: false });
      return true;
    });
  }

  async library() {
    const storage = this.storage;
    const { assets, rows, preview } = await mediaReferences(storage);
    const metadata = assets.length
      ? await storage.get(assets.map((asset) => "meta:" + asset.id))
      : new Map();
    return assets.map((asset) => ({
      ...asset,
      name: typeof asset.name === "string" ? asset.name : "",
      createdAt:
        Number.isSafeInteger(asset.createdAt) && asset.createdAt >= 0
          ? asset.createdAt
          : 0,
      type: metadata.get("meta:" + asset.id)?.type,
      campaigns: rows
        .filter((row) => row.mediaId === asset.id)
        .map((row) => row.title),
      inPreview: preview?.mediaId === asset.id,
    }));
  }

  removeMedia(id) {
    return this.storage.transaction(async (storage) => {
      const { assets, rows, preview } = await mediaReferences(storage);
      const asset = assets.find((entry) => entry.id === id);
      if (!asset || rows.some((row) => row.mediaId === id)) return false;
      if (preview?.mediaId === id) await storage.delete("preview");
      await storage.delete([
        "meta:" + id,
        ...Array.from(
          { length: Math.ceil(asset.size / chunkSize) },
          (_, index) => `media:${id}:${index}`,
        ),
      ]);
      await storage.put(
        "assets",
        assets.filter((entry) => entry !== asset),
      );
      return true;
    });
  }

  async exportData() {
    return {
      ...(await this.dashboard()),
      preview: await this.preview(),
      assets: await this.library(),
    };
  }

  mediaMeta(id) {
    return this.storage.get("meta:" + id);
  }

  async validMedia(row, storage = this.storage) {
    if (!row.mediaId) return true;
    const meta = await storage.get("meta:" + row.mediaId);
    return meta?.type.startsWith(row.mediaType + "/") ?? false;
  }

  async storeMedia(bytes, type, filename) {
    const id = crypto.randomUUID();
    const size = bytes.byteLength;
    let name = "";
    try {
      name = decodeURIComponent(filename ?? "")
        .replace(/[\x00-\x1f\x7f/\\]/g, "")
        .trim()
        .slice(0, 100);
    } catch {}
    return this.storage.transaction(async (storage) => {
      const assets = (await storage.get("assets")) ?? [];
      const now = Date.now();
      if (
        assets.length >= 50 ||
        assets.reduce((total, asset) => total + asset.size, size) >
          96 * 1024 * 1024
      )
        return null;
      const entries = {
        ["meta:" + id]: { type, size },
        assets: [...assets, { id, name, size, createdAt: now }],
      };
      for (let offset = 0; offset < size; offset += chunkSize) {
        entries[`media:${id}:${offset / chunkSize}`] = bytes.slice(
          offset,
          offset + chunkSize,
        );
      }
      await storage.put(entries);
      return { id, mediaType: type.split("/")[0], size };
    });
  }

  async mediaBytes(id, first, last) {
    const start = Math.floor(first / chunkSize);
    const end = Math.floor(last / chunkSize);
    const keys = Array.from(
      { length: end - start + 1 },
      (_, index) => `media:${id}:${index + start}`,
    );
    const chunks = await this.storage.get(keys);
    const bytes = new Uint8Array(last - first + 1);
    let offset = 0;
    for (const [index, key] of keys.entries()) {
      const chunk = chunks
        .get(key)
        .subarray(index === 0 ? first % chunkSize : 0);
      const section = chunk.subarray(0, bytes.length - offset);
      bytes.set(section, offset);
      offset += section.byteLength;
    }
    return bytes;
  }
}
