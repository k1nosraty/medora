import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function verifyHouseholdWrites(origin, expected, ownerHeaders) {
  const [owner, viewer] = expected.people,
    group = expected.group;
  const auth = await fetch(origin + "/api/v2/session", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: viewer.credential[0],
      password: "synthetic fixture password",
    }),
  });
  assert.equal(auth.status, 200);
  const headers = {
    ...ownerHeaders,
    "X-Medora-Owner": viewer.id,
    Cookie: auth.headers.get("set-cookie").split(";")[0],
  };
  const send = async (h, body, status = 200) => {
    const res = await fetch(origin + "/api/v2/household", {
      headers: h,
      method: body ? "POST" : "GET",
      ...(body && { body: JSON.stringify(body) }),
    });
    assert.equal(res.status, status, body?.action ?? "home");
    return res.json();
  };
  const home = await send(headers);
  assert.equal(home.groups[0].id, group);
  const ownerId = owner.member[0],
    viewerId = viewer.member[0];
  const read = { action: "view", group, target: ownerId };
  const visible = await send(headers, read);
  assert.deepEqual(visible.policy, {
    sections: ["water"],
    record: false,
    add: false,
  });
  assert.equal(visible.records.visits, undefined);
  const action = {
    action: "record",
    group,
    target: ownerId,
    operation: randomUUID(),
    kind: "water",
    day: Math.floor(Date.now() / 86400000) - 1,
    time: "10:00",
    amount: 175,
  };
  await send(headers, action, 403);
  await send(ownerHeaders, {
    action: "share",
    group,
    target: viewerId,
    sections: ["water"],
    days: 7,
    add: false,
    record: true,
  });
  await send(headers, { ...action, kind: "routine" }, 403);
  await send(headers, action);
  await send(headers, action);
  await send(headers, { ...action, amount: 275 }, 409);
  const after = await (
    await fetch(origin + "/api/v2/care", { headers: ownerHeaders })
  ).json();
  const added = after.records.water.at(-1);
  assert.equal(added.amount, 175);
  assert.equal(added.recordedBy, viewer.member[3]);
  assert.equal(after.records.water.length, owner.records.water.length + 1);
  owner.records.water.push(added);
  owner.revision++;
  await send(ownerHeaders, { action: "revoke", group, target: viewerId });
  await send(headers, read, 403);
  const created = await send(ownerHeaders, {
    action: "create",
    name: "Rehearsal",
    icon: "group",
  });
  await send(ownerHeaders, {
    action: "update-group",
    group: created.group,
    name: "Updated fixture",
    icon: "group",
  });
  const invited = await send(ownerHeaders, {
    action: "invite",
    group: created.group,
    email: viewer.credential[2],
  });
  await send(
    ownerHeaders,
    { action: "invite", group: created.group, email: viewer.credential[2] },
    409,
  );
  await send(headers, { action: "accept", invite: invited.invite });
  await send(headers, { action: "accept", invite: invited.invite }, 410);
  assert.ok((await send(headers)).groups.some((g) => g.id === created.group));
  await send(ownerHeaders, { action: "delete-group", group: created.group });
  const pending = await send(ownerHeaders, {
    action: "invite",
    group,
    email: "future@example.test",
  });
  expected.postFamily = {
    pending: pending.invite,
    key: ["family-operation", "", viewer.id, group, action.operation].join(":"),
  };
}
