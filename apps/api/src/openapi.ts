import {
  change,
  operation,
  toJsonSchema,
  credentials,
  identityBegin,
  identityFinish,
  familyAction,
} from "@medora/contracts";
const ownerHeader = {
  in: "header",
  name: "X-Medora-Owner",
  required: true,
  schema: { type: "string" },
  description: "Account expected by this client",
};
const session = [{ session: [] }];
const response = (description: string) => ({ description });
const jsonBody = (schema: unknown) => ({
  required: true,
  content: { "application/json": { schema } },
});
const binary = { type: "string", format: "binary" };
export const contract = {
  openapi: "3.1.0",
  info: { title: "Medora incremental care", version: "2.0.0" },
  components: {
    securitySchemes: {
      session: { type: "apiKey", in: "cookie", name: "__Host-medora_v2" },
    },
  },
  paths: {
    "/api/v2/health": {
      get: {
        responses: {
          "200": response("Database schema reachable"),
          "503": response("Service unavailable"),
        },
      },
    },
    "/api/v2/session": {
      post: {
        requestBody: jsonBody(toJsonSchema(credentials, { io: "input" })),
        responses: {
          "200": response("Session cookie issued"),
          "401": response("Invalid credentials"),
          "429": response("Rate limited"),
        },
      },
      get: {
        security: session,
        responses: {
          "200": response("Active account identifier"),
          "401": response("Session required"),
        },
      },
      delete: {
        security: session,
        responses: {
          "204": response("Session revoked"),
          "403": response("Invalid origin"),
        },
      },
    },
    "/api/v2/identity/challenges": {
      post: {
        requestBody: jsonBody(toJsonSchema(identityBegin, { io: "input" })),
        responses: {
          "202": response("Challenge accepted"),
          "400": response("Invalid input"),
          "429": response("Rate limited"),
        },
      },
    },
    "/api/v2/identity/verify": {
      post: {
        requestBody: jsonBody(toJsonSchema(identityFinish, { io: "input" })),
        responses: {
          "200": response("Registration or reset completed"),
          "400": response("Code unavailable"),
          "409": response("Account unavailable"),
        },
      },
    },
    "/api/v2/families": {
      parameters: [ownerHeader],
      get: {
        security: session,
        responses: {
          "200": response("Memberships and invitations"),
          "401": response("Session required"),
        },
      },
      post: {
        security: session,
        requestBody: jsonBody(toJsonSchema(familyAction, { io: "input" })),
        responses: {
          "200": response("Scoped action result"),
          "404": response("Resource or permission unavailable"),
          "409": response("Account changed"),
          "429": response("Rate limited"),
        },
      },
    },
    "/api/v2/backups": {
      parameters: [ownerHeader],
      get: {
        security: session,
        responses: {
          "200": response("Ready encrypted archives for this account"),
        },
      },
      post: {
        security: session,
        requestBody: {
          required: true,
          content: { "application/octet-stream": { schema: binary } },
        },
        responses: {
          "200": response("Verified digest and byte count"),
          "400": response("Unknown archive"),
          "409": response("Owner or quota conflict"),
          "413": response("Size limit exceeded"),
        },
      },
    },
    "/api/v2/backups/{id}": {
      parameters: [
        ownerHeader,
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
      ],
      get: {
        security: session,
        responses: {
          "200": {
            description: "Encrypted backup",
            content: { "application/octet-stream": { schema: binary } },
          },
          "404": response("Archive unavailable"),
          "503": response("Storage or integrity failure"),
        },
      },
    },
    "/api/v2/changes": {
      parameters: [
        {
          in: "header",
          name: "X-Medora-Owner",
          required: true,
          schema: { type: "string" },
          description: "Expected signed-in account for this device queue",
        },
      ],
      get: {
        security: [{ session: [] }],
        parameters: [
          {
            in: "query",
            name: "after",
            schema: { type: "integer", minimum: 0 },
          },
        ],
        responses: {
          "200": {
            description: "Ordered changes",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    changes: { type: "array", items: toJsonSchema(change) },
                  },
                  required: ["changes"],
                },
              },
            },
          },
          "401": { description: "Session required" },
        },
      },
      post: {
        security: [{ session: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: toJsonSchema(operation) } },
        },
        responses: {
          "200": {
            description: "Committed or replayed",
            content: { "application/json": { schema: toJsonSchema(change) } },
          },
          "409": { description: "Revision or generation conflict" },
        },
      },
    },
  },
};
