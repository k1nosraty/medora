import { z } from "zod";

export const waterEntry = z.object({
  amount: z.number().int().min(1).max(10000),
  day: z.number().int().min(-719162).max(2932896),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
}).strict();

export const operation = z.object({
  operation: z.uuid(),
  kind: z.literal("water"),
  id: z.string().min(1).max(512),
  baseRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  body: waterEntry.nullable()
}).strict();
export const change = operation.extend({cursor: z.number().int().positive()});
export const credentials = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(128)
}).strict();

export type Operation = z.infer<typeof operation>;
export type Change = z.infer<typeof change>;
export type WaterEntry = z.infer<typeof waterEntry>;

export const contract = {
  openapi: "3.1.0",
  info: { title: "Medora incremental care", version: "2.0.0" },
  components: {securitySchemes: {session: {type:"apiKey", in:"cookie", name:"__Host-medora_v2"}}},
  paths: {
    "/api/v2/changes": {
      get: {security:[{session:[]}], parameters:[{in:"query",name:"after",schema:{type:"integer",minimum:0}}],
        responses: {"200": {description:"Ordered changes",content:{"application/json":{schema:z.toJSONSchema(z.object({changes:z.array(change)}))}}}, "401":{description:"Session required"}}},
      post: {security:[{session:[]}], requestBody:{required:true,content:{"application/json":{schema:z.toJSONSchema(operation)}}},
        responses: {"200":{description:"Committed or replayed",content:{"application/json":{schema:z.toJSONSchema(change)}}}, "409":{description:"Revision or generation conflict"}}}
    }
  }
};
