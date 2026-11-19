import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";

const web = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
const { mergeCare } = await import(pathToFileURL(resolve(web, "../apps/web/product-assets/public/medication/features/sync/merge.js")));
const water = Array.from({ length: 2200 }, (_, index) => ({
  id: "synthetic-water-" + index, day: 20_000 + Math.floor(index / 3), time: "10:00", amount: 250
}));
const common = { medicines: {}, doses: {}, visits: {}, routines: {}, routineLogs: {}, settings: {}, water };
const device = { ...common, water: [{ ...water[0], amount: 400 }, ...water.slice(1)] };
const cloud = { ...common, water: [...water.slice(0, -1), { ...water.at(-1), amount: 650 }] };
const mergeTimes = [];
for (let i = 0; i < 100; i++) {
  const started = performance.now();
  const result = mergeCare(common, device, cloud);
  if (i >= 20) mergeTimes.push(performance.now() - started);
  if (result.water.length !== water.length || result.water[0].amount !== 400 || result.water.at(-1).amount !== 650) {
    throw new Error("The merge benchmark did not preserve both changes");
  }
}

function summarize(times) {
  times.sort((a, b) => a - b);
  const percentile = fraction => Number(times[Math.ceil(times.length * fraction) - 1].toFixed(2));
  return { samples: times.length, medianMs: percentile(0.5), p95Ms: percentile(0.95) };
}

const result = { merge: { records: water.length, bytes: Buffer.byteLength(JSON.stringify(common)), ...summarize(mergeTimes) } };
const privacyPath = resolve(web, "../apps/web/product-assets/public/medication/features/sync/private-care.js");
if (existsSync(privacyPath)) {
  const { importRecoveryKey, openPrivateCare, sealPrivateCare } = await import(pathToFileURL(privacyPath));
  const { validateCareRecords } = await import(pathToFileURL(resolve(web, "../apps/web/product-assets/public/medication/domain/care-records.js")));
  const key = await importRecoveryKey("a".repeat(64));
  const visits = Object.fromEntries(Array.from({ length: 220 }, (_, index) => {
    const id = "synthetic-visit-" + index;
    return [id, { id, day: 20_000 + index, time: "10:00", name: "Synthetic visit", note: "x".repeat(4096) }];
  }));
  const snapshot = { ...device, visits, careSchemaVersion: 2 };
  const times = [];
  let bytes;
  for (let i = 0; i < 35; i++) {
    const started = performance.now();
    const serialized = JSON.stringify(await sealPrivateCare(snapshot, key, true));
    const received = JSON.parse(serialized);
    validateCareRecords(received);
    const opened = await openPrivateCare(received, key);
    if (i >= 5) times.push(performance.now() - started);
    bytes = Buffer.byteLength(serialized);
    if (opened.visits["synthetic-visit-219"].note !== visits["synthetic-visit-219"].note ||
        opened.water.length !== water.length) throw new Error("The sync benchmark did not preserve the synthetic records");
  }
  result.privateSnapshot = { records: water.length + Object.keys(visits).length, bytes, ...summarize(times) };
}
console.log(JSON.stringify(result, null, 2));
