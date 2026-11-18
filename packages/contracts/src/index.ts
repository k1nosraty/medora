import { z } from "zod";

export const waterEntry = z
  .object({
    amount: z.number().int().min(1).max(10000),
    day: z.number().int().min(-719162).max(2932896),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/),
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

export const accountEmail = z.email().max(254).toLowerCase();
export const identityBegin = z
  .object({
    email: accountEmail,
    purpose: z.enum(["register", "reset"]),
    language: z.enum(["fa", "en"]).optional(),
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

const field = z.enum([
  "medicines",
  "doses",
  "visits",
  "routines",
  "routineLogs",
  "sleepRecords",
  "cycleDays",
  "cycleRecords",
  "scheduleHistory",
  "settings",
  "water",
  "waterOrder",
  "careSchemaVersion",
  "privacyVersion",
  "privacyKey",
  "privacyRotation",
]);
const recordKey = z.string().min(1).max(550).nullable();
export const careCommit = z
  .object({
    operation: z.uuid(),
    baseRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    changes: z
      .array(
        z.union([
          z.tuple([field, recordKey]),
          z.tuple([field, recordKey, z.json()]),
        ]),
      )
      .max(4096),
    zone: z.string().min(1).max(64).optional(),
    rotationProof: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type CareCommit = z.infer<typeof careCommit>;

export const emailConfirmation = identityFinish
  .pick({ challenge: true, code: true })
  .extend({ email: z.email().max(254).toLowerCase() });
export const grantedRegistration = identityFinish
  .pick({ challenge: true, password: true })
  .extend({
    grant: z.string().regex(/^[a-f0-9]{64}$/),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,32}$/),
  });

export const householdCommand = z
  .object({
    action: z.enum([
      "create",
      "update-group",
      "delete-group",
      "invite-lookup",
      "invite",
      "accept",
      "decline",
      "cancel",
      "share",
      "revoke",
      "view",
      "record",
      "add",
    ]),
    group: z.uuid().optional(),
    invite: z.uuid().optional(),
    target: z.union([z.uuid(), z.literal("all")]).optional(),
    name: z.string().trim().min(1).max(60).optional(),
    icon: z.string().max(48).optional(),
    query: z.string().trim().min(1).max(254).optional(),
    email: accountEmail.optional(),
    sections: z.array(z.string()).max(12).optional(),
    all: z.boolean().optional(),
    record: z.boolean().optional(),
    add: z.boolean().optional(),
    days: z
      .union([
        z.literal(7),
        z.literal(30),
        z.literal(90),
        z.literal("keep"),
        z.null(),
      ])
      .optional(),
    kind: z.enum(["water", "routine", "medicine", "visit", "cycle"]).optional(),
    operation: z.uuid().optional(),
    id: z.string().min(1).max(512).optional(),
  })
  .catchall(z.json());
export type HouseholdCommand = z.infer<typeof householdCommand>;
