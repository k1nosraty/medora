import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backup, DatabaseSync } from "node:sqlite";

export const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const key = (master,purpose) => hkdfSync("sha256",master,"Medora SQLite archive v1",purpose,32);
function tag(master,data) { return createHmac("sha256",key(master,"manifest")).update(JSON.stringify(data)).digest(); }
const aad = (snapshot,entry) => Buffer.from(JSON.stringify([snapshot,entry.namespace,entry.object,entry.digest]));
function seal(master,snapshot,entry,bytes) {
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key(master,"object"),iv);
  cipher.setAAD(aad(snapshot,entry));
  return Buffer.concat([iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
}
export function unseal(master,snapshot,entry,archive) {
  const decrypt=createDecipheriv("aes-256-gcm",key(master,"object"),archive.subarray(0,12));
  decrypt.setAAD(aad(snapshot,entry));decrypt.setAuthTag(archive.subarray(-16));
  const bytes=Buffer.concat([decrypt.update(archive.subarray(12,-16)),decrypt.final()]);
  if (sha(bytes)!==entry.digest) throw new Error("Object digest mismatch");
  return bytes;
}
const sort = list => [...list].sort();
export function classes() { return ["Credentials","EmailAccount","Families","MedicationReminders","Operations","Promotions","PushPilot"]; }

export async function exportObjects(source,census,output,master) {
  // The caller supplies a stopped, consistent copy and a separately established inventory.
  if (!census || !Object.keys(census).length) throw new Error("Independent namespace census required");
  const dirs=await readdir(source,{withFileTypes:true});
  if (dirs.some(d=>!d.isDirectory()) || JSON.stringify(sort(dirs.map(d=>d.name)))!==JSON.stringify(sort(Object.keys(census))))
    throw new Error("Namespace census mismatch");
  for (const name of classes()) if (!dirs.some(d=>d.name.endsWith("-"+name))) throw new Error("Missing required namespace");
  const snapshot=randomBytes(16).toString("hex"), entries=[];
  await mkdir(output,{mode:0o700});
  const scratch=await mkdtemp(join(tmpdir(),"medora-object-"));
  try {
    for (const ns of sort(Object.keys(census))) {
      const members=await readdir(join(source,ns),{withFileTypes:true});
      const bases=sort(members.filter(f=>f.name.endsWith(".sqlite")).map(f=>f.name));
      if (!Array.isArray(census[ns]) || JSON.stringify(bases)!==JSON.stringify(sort(census[ns])) ||
          members.some(f=>!f.isFile() || !bases.includes(f.name.replace(/-(wal|shm)$/,""))))
        throw new Error("Object census mismatch or unrecognized file");
      for (const object of bases) {
        const input=new DatabaseSync(join(source,ns,object),{readOnly:true});
        const path=join(scratch,"image.sqlite");
        try { await backup(input,path); } finally { input.close(); }
        const copy=new DatabaseSync(path);
        let tables;
        try {
          copy.exec("PRAGMA journal_mode=DELETE");
          if (copy.prepare("PRAGMA integrity_check").get().integrity_check!=="ok") throw new Error("SQLite integrity check failed");
          tables=Object.fromEntries(copy.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({name})=>{
            const quoted='"'+name.replaceAll('"','""')+'"';
            return [name,copy.prepare("SELECT count(*) AS n FROM "+quoted).get().n];
          }));
        } finally { copy.close(); }
        const bytes=await readFile(path);
        const entry={namespace:ns,object,digest:sha(bytes),tables,bytes:bytes.length,file:entries.length+".gcm"};
        const archive=seal(master,snapshot,entry,bytes); bytes.fill(0);
        await writeFile(join(output,entry.file),archive,{mode:0o600,flag:"wx"});
        entries.push(entry);await rm(path);
      }
    }
    const manifest={version:1,snapshot,inventory:census,entries};
    await writeFile(join(output,"manifest.json"),JSON.stringify({manifest,tag:tag(master,manifest).toString("hex")}),{mode:0o600,flag:"wx"});
    return manifest;
  } finally { await rm(scratch,{recursive:true,force:true}); }
}
export async function readManifest(dir,master) {
  const {manifest,tag:mac}=JSON.parse(await readFile(join(dir,"manifest.json"),"utf8"));
  if (!/^[0-9a-f]{64}$/.test(mac) || !timingSafeEqual(tag(master,manifest),Buffer.from(mac,"hex")) || manifest.version!==1)
    throw new Error("Manifest authentication failed");
  return manifest;
}

export async function importObjects(client,dir,master,verifyOnly=false) {
  const m=await readManifest(dir,master);
  let checked=0;
  for (const e of m.entries) {
    if (!/^\d+\.gcm$/.test(e.file)) throw new Error("Invalid object filename");
    const identity=[m.snapshot,e.namespace,e.object];
    if (!verifyOnly) {
      const archive=await readFile(join(dir,e.file));
      unseal(master,m.snapshot,e,archive).fill(0);
      await client.query("INSERT INTO medora.source_objects(snapshot,namespace,object_id,digest,archive) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [...identity,e.digest,archive]);
    }
    const {rows:[stored]}=await client.query("SELECT digest,archive FROM medora.source_objects WHERE snapshot=$1 AND namespace=$2 AND object_id=$3",identity);
    if (!stored || stored.digest!==e.digest) throw new Error("Missing or divergent target object");
    const bytes=unseal(master,m.snapshot,e,stored.archive);
    try {
      if (bytes.length!==e.bytes) throw new Error("Length mismatch");
      const db=new DatabaseSync(":memory:");
      try {
        db.deserialize(bytes);
        for (const [table,n] of Object.entries(e.tables)) {
          const name='"'+table.replaceAll('"','""')+'"';
          if (db.prepare("SELECT count(*) AS n FROM "+name).get().n!==n) throw new Error("Record count mismatch");
        }
      } finally { db.close(); }
    } finally { bytes.fill(0); }
    checked++;
  }
  const total=await client.query("SELECT count(*)::int AS n FROM medora.source_objects WHERE snapshot=$1",[m.snapshot]);
  if (total.rows[0].n!==checked) throw new Error("Target inventory mismatch");
  return {namespaces:Object.keys(m.inventory).length,objects:checked,rows:m.entries.reduce((n,e)=>n+Object.values(e.tables).reduce((sum,x)=>sum+x,0),0)};
}
