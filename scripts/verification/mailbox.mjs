import { createServer } from "node:http";
import { once } from "node:events";
export async function fixtureMailbox() {
  const codes = new Map();
  const mailbox = createServer(async (req, res) => {
    if (req.url !== "/api/v1/send" || req.method !== "POST")
      return res.writeHead(404).end();
    const parts = [];
    for await (const part of req) parts.push(part);
    const message = JSON.parse(Buffer.concat(parts));
    const text = message.Text.replace(/[۰-۹]/g, (digit) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)),
    );
    const code = text.match(/\b(\d{6})\b/)?.[1];
    if (code) codes.set(message.To[0].Email, code);
    res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
  });
  mailbox.listen(0, "127.0.0.1");
  await once(mailbox, "listening");
  return {
    codes,
    origin: "http://127.0.0.1:" + mailbox.address().port,
    close: () => new Promise((resolve) => mailbox.close(resolve)),
  };
}
