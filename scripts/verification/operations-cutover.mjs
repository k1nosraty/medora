import assert from "node:assert/strict";

export async function verifyOperationalWrites(origin, headers, expected) {
  const base = origin + "/api/v2";
  const body = {
    message: "Fixture ticket",
    diagnostics: {
      version: "fixture",
      platform: "Other",
      permission: "default",
      ignored: "not collected",
    },
  };
  const request = async (path, method = "GET", data, owner = headers) =>
    fetch(base + path, {
      method,
      headers: owner,
      ...(data && { body: JSON.stringify(data) }),
    });
  assert.equal((await request("/support", "GET", undefined, {})).status, 401);
  assert.equal((await request("/admin/operations/tickets")).status, 403);
  const rolledOut = await request("/operations");
  assert.equal(rolledOut.status, 200);
  assert.equal((await rolledOut.json()).flags.support, 100);
  assert.equal((await request("/operations/activity", "POST")).status, 204);
  const response = await request("/support", "POST", body);
  assert.equal(response.status, 201);
  const { ticket } = await response.json();
  assert.ok(
    (await (await request("/support")).json()).tickets.some(
      (row) => row.id === ticket.id,
    ),
  );
  const login = await request("/session", "POST", {
    username: "fixture1",
    password: "synthetic fixture password",
  });
  assert.equal(login.status, 200);
  const agent = {
    ...headers,
    Cookie: login.headers.get("set-cookie").split(";")[0],
  };
  assert.ok(
    !(
      await (await request("/support", "GET", undefined, agent)).json()
    ).tickets.some((row) => row.id === ticket.id),
  );
  assert.equal(
    (
      await (
        await request("/admin/operations/access", "GET", undefined, agent)
      ).json()
    ).role,
    "admin",
  );
  const { tickets } = await (
    await request("/admin/operations/tickets", "GET", undefined, agent)
  ).json();
  assert.deepEqual(
    JSON.parse(tickets.find((row) => row.id === ticket.id).diagnostics),
    {
      version: "fixture",
      platform: "Other",
      permission: "default",
    },
  );
  assert.equal(
    (
      await request(
        "/admin/operations/tickets",
        "PUT",
        { id: ticket.id, reply: "Fixture reply", status: "closed" },
        agent,
      )
    ).status,
    200,
  );
  const updated = (await (await request("/support")).json()).tickets.find(
    (row) => row.id === ticket.id,
  );
  assert.equal(updated.reply, "Fixture reply");
  assert.equal(updated.status, "closed");
  const settings = {
    flags: { promotions: 100, support: 100 },
    notice: {
      title: "Fixture notice",
      message: "Fixture only",
      enabled: true,
      start: null,
      end: null,
    },
  };
  assert.equal(
    (await request("/admin/operations", "PUT", settings, agent)).status,
    200,
  );
  const dashboard = await (
    await request("/admin/operations", "GET", undefined, agent)
  ).json();
  assert.equal(dashboard.notice.title, settings.notice.title);
  assert.ok(
    dashboard.audit.some((event) => event.action === "operations_updated"),
  );
  const list = await request(
    "/admin/accounts?q=fixture0",
    "GET",
    undefined,
    agent,
  );
  assert.equal(list.status, 200);
  const { users } = await list.json();
  assert.equal(users.length, 1);
  assert.equal(users[0].admin, false);
  assert.equal(
    (await request("/admin/accounts?q=fixture0", "GET")).status,
    403,
  );
  expected.postTicket = { id: ticket.id, reply: updated.reply };
  return {
    actor: agent,
    target: { username: users[0].username, tag: users[0].tag },
  };
}
