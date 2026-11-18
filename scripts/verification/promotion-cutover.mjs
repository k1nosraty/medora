import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export async function verifyCampaignWrites(origin, expected, headers) {
  const base = origin + "/api/v2";
  const login = await fetch(base + "/session", {
    method: "POST",
    headers,
    body: JSON.stringify({
      username: "fixture1",
      password: "synthetic fixture password",
    }),
  });
  assert.equal(login.status, 200);
  const actor = {
    ...headers,
    Cookie: login.headers.get("set-cookie").split(";")[0],
  };
  const asset = Buffer.alloc(128 * 1024 + 19, 7);
  asset.write("GIF89a", 0, "ascii");
  const uploaded = await fetch(base + "/admin/promotion/media", {
    method: "POST",
    headers: {
      ...actor,
      "Content-Type": "application/octet-stream",
      "X-Medora-Filename": "fixture.gif",
    },
    body: asset,
  });
  assert.equal(uploaded.status, 201);
  const { id: mediaId } = await uploaded.json();
  const creative = {
    enabled: true,
    title: "Fixture campaign",
    description: "Fixture only",
    url: "",
    mediaType: "image",
    mediaId,
    create: true,
  };
  const draft = await fetch(base + "/admin/promotion", {
    method: "PUT",
    headers: actor,
    body: JSON.stringify(creative),
  });
  assert.equal(draft.status, 200);
  const {
    promotion: { id, creativeId },
  } = await draft.json();
  const published = await (await fetch(base + "/promotion")).json();
  assert.equal(published.promotion.creativeId, creativeId);
  const url = new URL(published.promotion.mediaUrl, origin);
  const media = await fetch(url, { headers: { Range: "bytes=131065-131081" } });
  assert.equal(media.status, 206);
  assert.deepEqual(
    Buffer.from(await media.arrayBuffer()),
    asset.subarray(131065, 131082),
  );
  assert.equal(
    (
      await fetch(base + "/promotion/events", {
        method: "POST",
        headers,
        body: JSON.stringify({ id, event: "impression" }),
      })
    ).status,
    204,
  );
  const preview = await fetch(base + "/admin/promotion/preview", {
    method: "PUT",
    headers: actor,
    body: JSON.stringify(creative),
  });
  assert.equal(preview.status, 200);
  assert.equal((await fetch(base + "/admin/promotion/preview")).status, 401);
  assert.equal(
    (
      await fetch(base + "/admin/promotion/media", {
        method: "DELETE",
        headers: actor,
        body: JSON.stringify({ id: mediaId }),
      })
    ).status,
    409,
  );
  expected.postCampaign = {
    id,
    mediaId,
    creativeId,
    hash: createHash("sha256").update(asset).digest("hex"),
  };
}
