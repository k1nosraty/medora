import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { verifyCoverage } from "./evidence.mjs";
async function inventory(root, base = root) {
  const result = [];
  for (const e of (await readdir(base, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(base, e.name);
    if (e.isDirectory()) result.push(...(await inventory(root, path)));
    else if (e.isFile()) {
      const bytes = await readFile(path);
      result.push({
        name: relative(root, path),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } else throw Error("Unexpected artifact entry");
  }
  return result;
}
const worker = process.argv[2];
const evidenceDir = process.argv[3] ?? "dist";
if (!worker || !(await stat(worker)).isDirectory())
  throw Error("Supply the local Worker output directory");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain"))
  throw Error("Commit candidate changes before recording artifact hashes");
for (const entry of [
  "apps/web/dist/medication/index.html",
  "apps/web/dist/medication/sw.js",
  "apps/web/dist/journal/index.html",
  "apps/web/dist/sw.js",
  "apps/web/dist/manifest.webmanifest",
  "apps/api/dist/server.mjs",
  join(worker, "candidate.js"),
  join(worker, "portable.js"),
]) {
  const info = await stat(entry);
  if (!info.isFile() || info.size === 0)
    throw Error("Missing required artifact: " + entry);
}
const evidenceFiles = [
  "reconciliation.json",
  "recovery-refusal.json",
  "imported-account-erasure.json",
  "postgres-handoff.json",
  "visual-parity.json",
  "performance-product.json",
];
const evidence = await Promise.all(
  evidenceFiles.map(async (name) => {
    const bytes = await readFile(join(evidenceDir, name));
    return {
      name,
      report: JSON.parse(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }),
);
const [reconciled, refused, erased, handoff, visual, performance] =
  evidence.map((entry) => entry.report);
verifyCoverage(handoff, visual);
if (
  reconciled.source !== "synthetic Workerd" ||
  !reconciled.reconciled ||
  !reconciled.legacyWriterFenced ||
  !reconciled.postWriteRollback?.replayed ||
  reconciled.postWriteRollback.reminderDevices < 2 ||
  reconciled.postWriteRollback.backupObjects !== 1 ||
  reconciled.postWriteRollback.deletedAccounts !== 1 ||
  !reconciled.operationsExportVerified ||
  !reconciled.corruptBackupPublicationBlocked ||
  !reconciled.releaseNotificationReplayed ||
  erased.importedAccountErasure?.deletedAccounts !== 1 ||
  !erased.importedAccountErasure?.legacySessionRevoked ||
  !erased.importedAccountErasure?.delayedObjectCleanupRetried ||
  !reconciled.passwordResetReplayed ||
  !reconciled.registrationReplayed ||
  !reconciled.legacySessionContinuity ||
  !reconciled.operationsReplayed ||
  !reconciled.campaignMediaReplayed ||
  handoff.accounts !== 2 ||
  handoff.objects !== 1 ||
  !handoff.sessionsPreserved ||
  !handoff.grantPreserved ||
  !handoff.outboxResumed ||
  !handoff.updatedServiceWorker ||
  !handoff.reversedAfterWrites ||
  !handoff.abortedCopyRecovered ||
  !handoff.concurrentWriterDrained ||
  !handoff.standaloneWranglerVerified ||
  !handoff.backupDecrypted ||
  refused.reconciled !== false ||
  !refused.unsupportedMutation?.recoveryPublicationBlocked ||
  !refused.unsupportedMutation?.pendingPasswordReset ||
  !visual.identicalDocumentMarkup ||
  performance.trials?.length !== 3
)
  throw Error("Incomplete candidate fixture evidence");
const manifest = {
  readiness: "NOT READY",
  production: "NOT DEPLOYED",
  reference: visual.reference,
  evidence: evidence.map(({ name, sha256 }) => ({ name, sha256 })),
  branch:
    git("branch", "--show-current") ||
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME,
  commit: git("rev-parse", "HEAD"),
  web: await inventory("apps/web/dist"),
  api: await inventory("apps/api/dist"),
  worker: await inventory(worker),
};
console.log(JSON.stringify(manifest, null, 2));
