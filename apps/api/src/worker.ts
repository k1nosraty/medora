import { Pool } from "pg";
import { createApp } from "./app";
import { verifier } from "./password";
import { repository } from "./repository";
import { passwordKeys } from "./settings";

interface Env {
  HYPERDRIVE:{connectionString:string};
  ASSETS:{fetch(request:Request):Promise<Response>};
  MEDORA_PASSWORD_KEYS:string;
}
export default {
  async fetch(request:Request, env:Env, ctx:{waitUntil(task:Promise<unknown>):void}) {
    if (!new URL(request.url).pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const pool = new Pool({connectionString:env.HYPERDRIVE.connectionString,max:2});
    try {
      return await createApp(repository(pool),verifier(passwordKeys(env.MEDORA_PASSWORD_KEYS))).fetch(request);
    } finally { ctx.waitUntil(pool.end()); }
  }
};
