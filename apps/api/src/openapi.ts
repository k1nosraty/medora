import { change, operation, toJsonSchema } from "@medora/contracts";
export const contract = {
  openapi: "3.1.0",
  info: { title: "Medora incremental care", version: "2.0.0" },
  components: {
    securitySchemes: {
      session: { type: "apiKey", in: "cookie", name: "__Host-medora_v2" },
    },
  },
  paths: {
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
