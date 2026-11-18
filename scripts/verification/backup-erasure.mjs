import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export async function saveFixtureBackup(origin, headers, owner, ciphertext) {
  const data = ciphertext ? Buffer.from(ciphertext) : randomBytes(192);
  if (!ciphertext) data.write("MEDORAW\x01", 0, "binary");
  const digest = createHash("sha256").update(data).digest("hex");
  const requestHeaders = {
    ...headers,
    "X-Medora-Owner": owner,
    "Content-Type": "application/octet-stream",
  };
  const url = origin + "/api/v2/backups";
  for (let i = 0; i < 2; i++) {
    const write = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: data,
    });
    assert.equal(write.status, 200);
    assert.equal((await write.json()).id, digest);
  }
  assert.equal(
    (await fetch(url, { headers: requestHeaders }).then((r) => r.json()))
      .backups.length,
    1,
  );
  assert.deepEqual(
    Buffer.from(
      await fetch(url + "/" + digest, { headers: requestHeaders }).then((r) =>
        r.arrayBuffer(),
      ),
    ),
    data,
  );
  return digest;
}

export async function eraseFixtureAccount(
  origin,
  headers,
  target,
  container,
  digest,
  deferCleanup = false,
) {
  const list = await fetch(
    origin + "/api/v2/admin/accounts?q=" + encodeURIComponent(target.username),
    { headers },
  );
  const {
    users: [user],
  } = await list.json();
  assert.ok(user);
  if (deferCleanup) container.deferDeletes(true);
  const result = await fetch(origin + "/api/v2/admin/accounts", {
    method: "DELETE",
    headers,
    body: JSON.stringify({ username: user.username, tag: user.tag }),
  });
  assert.equal(result.status, 200);
  assert.equal(
    (await result.json()).cleanup.status,
    deferCleanup ? "pending" : "complete",
  );
  const key = "/medora-test/backups/" + target.owner + "/" + digest;
  assert.equal(container.objects.has(key), deferCleanup);
  assert.equal(
    (await fetch(origin + "/api/v2/session", { headers: target.headers }))
      .status,
    401,
  );
  const login = await fetch(origin + "/api/v2/session", {
    method: "POST",
    headers,
    body: JSON.stringify({
      username: target.username,
      password: target.password,
    }),
  });
  assert.equal(login.status, 401);
  assert.equal(
    (
      await fetch(
        origin +
          "/api/v2/admin/accounts?q=" +
          encodeURIComponent(target.username),
        { headers },
      ).then((r) => r.json())
    ).users.length,
    0,
  );
  if (deferCleanup) {
    container.deferDeletes(false);
    const until = Date.now() + 12_000;
    while (container.objects.has(key) && Date.now() < until) await delay(100);
    assert.equal(container.objects.has(key), false);
  }
}
