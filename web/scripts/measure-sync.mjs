import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const web = resolve(process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)));
const { mergeCare } = await import(pathToFileURL(resolve(web, "public/medication/features/sync/merge.js")));
const water = Array.from({ length: 2200 }, (_, index) => ({
  id: "synthetic-water-" + index, day: 20_000 + Math.floor(index / 3), time: "10:00", amount: 250
}));
const common = { medicines: {}, doses: {}, visits: {}, routines: {}, routineLogs: {}, settings: {}, water };
const device = { ...common, water: [{ ...water[0], amount: 400 }, ...water.slice(1)] };
const cloud = { ...common, water: [...water.slice(0, -1), { ...water.at(-1), amount: 650 }] };
const times = [];
for (let i = 0; i < 100; i++) {
  const started = performance.now();
  const result = mergeCare(common, device, cloud);
  if (i >= 20) times.push(performance.now() - started);
  if (result.water.length !== water.length || result.water[0].amount !== 400 || result.water.at(-1).amount !== 650) {
    throw new Error("The merge benchmark did not preserve both changes");
  }
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ records: water.length, bytes: Buffer.byteLength(JSON.stringify(common)),
  samples: times.length, medianMs: Number(times[40].toFixed(2)), p95Ms: Number(times[75].toFixed(2)) }, null, 2));
