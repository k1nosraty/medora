import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import {join} from "node:path";
import {tmpdir} from "node:os";
const url=process.env.MEDORA_TEST_DATABASE_URL;
if(!url || !["localhost","127.0.0.1"].includes(new URL(url).hostname))throw Error("A fresh isolated loopback PostgreSQL fixture database is required");
const dir=await mkdtemp(join(tmpdir(),"medora-rehearsal-"));
const source=join(dir,"fixture"),archive=join(dir,"archive"),key=join(dir,"key");
await writeFile(key,randomBytes(32).toString("hex"),{mode:0o600});
const env={...process.env,DATABASE_URL:url,MEDORA_ARCHIVE_KEY_FILE:key};
function run(args){
 const result=spawnSync(process.execPath,args,{env,encoding:"utf8"});
 if(result.status!==0)throw Error("Fixture rehearsal command failed: "+args[0]+" "+(args[1]??"").split("/").at(-1));
 return result.stdout.trim();
}
try{
 run(["scripts/verification/legacy-source.mjs",source]);
 run(["scripts/migration/apply.mjs"]);
 const cli="scripts/migration/objects.mjs";
 run([cli,"export",join(source,"do"),join(source,"census.json"),archive,join(source,"identity.json")]);
 const physical=JSON.parse(run([cli,"import",archive]));
 assert.deepEqual(physical,JSON.parse(run([cli,"verify",archive])));
 const records=JSON.parse(run([cli,"project",archive]));
 assert.deepEqual(records,JSON.parse(run([cli,"project",archive])));
 assert.deepEqual(records,JSON.parse(run([cli,"verify-projection",archive])));
 assert.deepEqual(records,{accounts:2,legacy_people:2,legacy_sessions:2,legacy_care:1603,households:1,memberships:2,grants:1,import_devices:1,account_devices:2});
 const {manifest}=JSON.parse(await readFile(join(archive,"manifest.json"),"utf8"));
 console.log(JSON.stringify({source:"synthetic Workerd",snapshot:manifest.snapshot,physical,records,replay:true,reconciled:true}));
}finally{await rm(dir,{recursive:true,force:true});}
