import { createServer } from "node:http";
import { once } from "node:events";

export async function fixtureObjects() {
  const objects = new Map();
  let deferDeletes = false;
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    if (!path.startsWith("/medora-test/") && path !== "/medora-test")
      return res.writeHead(404).end();
    if (path === "/medora-test") return res.writeHead(200).end();
    switch (req.method) {
      case "PUT": {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        objects.set(path, Buffer.concat(chunks));
        return res.writeHead(200).end();
      }
      case "GET":
        return objects.has(path)
          ? res.writeHead(200).end(objects.get(path))
          : res.writeHead(404).end();
      case "DELETE":
        if (deferDeletes) return res.writeHead(503).end();
        objects.delete(path);
        return res.writeHead(204).end();
      default:
        return res.writeHead(405).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    bindings: {
      S3_ENDPOINT: "http://127.0.0.1:" + server.address().port,
      S3_BUCKET: "medora-test",
      S3_ACCESS_KEY_ID: "isolated-fixture",
      S3_SECRET_ACCESS_KEY: "isolated-fixture-only",
    },
    objects,
    deferDeletes: (defer) => {
      deferDeletes = defer;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
