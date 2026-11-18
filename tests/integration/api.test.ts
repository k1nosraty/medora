import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { passwordProof } from "../../web/src/accounts/auth-crypto.mjs";
import { createApp } from "../../apps/api/src/app";
import { repository } from "../../apps/api/src/repository";
import { verifier } from "../../apps/api/src/password";

const url = process.env.MEDORA_TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL incremental care",()=>{
  const pool = new Pool({connectionString:url});
  const store = repository(pool);
  const key = "3".repeat(64);
  const app = createApp(store,verifier({legacy:key}));
  const origin = "https://medora.test";
  const names = [randomUUID(),randomUUID()];
  const cookies:string[] = [];
  const send = (path:string,method="GET",data?:unknown,cookie="")=>app.request(origin+"/api/v2/"+path,{
    method,headers:{origin,cookie,"Content-Type":"application/json"},...(data===undefined?{}:{body:JSON.stringify(data)})});
  beforeAll(async ()=>{
    for (const name of names) {
      const salt = randomUUID();
      const proof = await passwordProof(key,"a synthetic test password",salt);
      await pool.query("INSERT INTO medora.accounts(id,email,username,password_key,password_salt,password_proof,sync_generation) VALUES ($1,$2,$1,'legacy',$3,$4,2)",[name,name+"@example.test",salt,proof]);
      const r=await send("session","POST",{username:name,password:"a synthetic test password"});
      expect(r.status).toBe(200);
      const header=r.headers.get("Set-Cookie")!;
      expect(header).toContain("HttpOnly"); expect(header).toContain("Secure");
      cookies.push(header.split(";")[0]!);
    }
  });
  afterAll(()=>pool.end());
  it("commits once, detects changed retries, serializes concurrent edits and retains tombstones",async ()=>{
    const op={operation:randomUUID(),kind:"water",id:"log",baseRevision:0,body:{day:20202,time:"08:30",amount:250}};
    const write=(data:unknown)=>send("changes","POST",data,cookies[0]);
    const first=await write(op);
    expect(first.status).toBe(200);
    const saved=await first.json();
    expect(await (await write(op)).json()).toEqual(saved);
    expect((await write({...op,body:{...op.body,amount:500}})).status).toBe(409);
    const updates=await Promise.all([300,350].map(amount=>write({...op,operation:randomUUID(),baseRevision:saved.cursor,body:{...op.body,amount}})));
    expect(updates.map(r=>r.status).sort()).toEqual([200,409]);
    expect(await (await send("changes","GET",undefined,cookies[1])).json()).toEqual({changes:[]});
    const remove=await write({...op,operation:randomUUID(),baseRevision:saved.cursor+1,body:null});
    expect(remove.status).toBe(200);
    const feed=await (await send("changes?after=2","GET",undefined,cookies[0])).json();
    expect(feed.changes).toHaveLength(1); expect(feed.changes[0].body).toBe(null);
  });
  it("requires an active session and same-origin writes and honors sign-out",async ()=>{
    expect((await send("changes")).status).toBe(401);
    expect((await app.request(origin+"/api/v2/changes",{method:"POST",headers:{cookie:cookies[1]!}})).status).toBe(403);
    expect((await send("session","DELETE",undefined,cookies[1])).status).toBe(204);
    expect((await send("changes","GET",undefined,cookies[1])).status).toBe(401);
  });
});
