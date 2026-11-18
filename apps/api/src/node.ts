import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { createApp } from "./app";
import { verifier } from "./password";
import { repository } from "./repository";
import { passwordKeys } from "./settings";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({connectionString:process.env.DATABASE_URL,max:8});
const app = createApp(repository(pool),verifier(passwordKeys(process.env.MEDORA_PASSWORD_KEYS)));
const server = serve({fetch:app.fetch, hostname:process.env.HOST ?? "127.0.0.1", port:Number(process.env.PORT ?? 8802)});
process.on("SIGTERM",()=>server.close(()=>void pool.end()));
