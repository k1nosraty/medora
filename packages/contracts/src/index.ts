import { z } from "zod";

export const waterEntry = z
  .object({
    amount: z.number().int().min(1).max(10000),
    day: z.number().int().min(-719162).max(2932896),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();

export const operation = z
  .object({
    operation: z.uuid(),
    kind: z.literal("water"),
    id: z
      .string()
      .min(1)
      .max(512)
      .refine(
        (value) =>
          value !== "prototype" && !Object.hasOwn(Object.prototype, value),
      ),
    baseRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    body: waterEntry.nullable(),
  })
  .strict();
export const change = operation.extend({ cursor: z.number().int().positive() });
export const credentials = z
  .object({
    username: z.string().trim().toLowerCase().min(1).max(64),
    password: z.string().min(1).max(128),
  })
  .strict();

export type Operation = z.infer<typeof operation>;
export type Change = z.infer<typeof change>;
export type WaterEntry = z.infer<typeof waterEntry>;

export const toJsonSchema = z.toJSONSchema;

export const identityBegin = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    purpose: z.enum(["register", "reset"]),
  })
  .strict();
export const identityFinish = z
  .object({
    challenge: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
    password: z
      .string()
      .max(128)
      .refine((s) => [...s].length >= 15),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,32}$/)
      .optional(),
  })
  .strict();

const family = z.uuid();
export const familyAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      label: z.string().trim().min(1).max(60),
    })
    .strict(),
  z
    .object({
      action: z.literal("invite"),
      family,
      email: z
        .email()
        .max(254)
        .transform((s) => s.toLowerCase()),
    })
    .strict(),
  z.object({ action: z.literal("accept"), invite: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("grant"),
      family,
      viewer: z.string().min(1).max(128),
      allow: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("water"),
      family,
      owner: z.string().min(1).max(128),
      day: z.number().int().min(-719162).max(2932896),
    })
    .strict(),
]);
