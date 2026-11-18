import {DatabaseSync} from "node:sqlite";
import {deserialize} from "node:v8";
import {isDeepStrictEqual} from "node:util";
import {importObjects,readManifest,unseal} from "./object-archive.mjs";

// Only these fixed tables and columns can appear in generated SQL.
const columns={
 accounts:["id","email","username","password_salt","password_proof","password_key","created_at"],
 legacy_people:["snapshot","owner","epoch","zone","source_revision"],
 legacy_sessions:["snapshot","owner","digest","expires_at"],
 legacy_care:["snapshot","owner","kind","id","value"],
 households:["snapshot","id","owner","label","icon"],
 memberships:["snapshot","id","group_id","person","label"],
 grants:["snapshot","group_id","owner","recipient","policy","expires_at"],
 import_devices:["snapshot","device","state"],
 account_devices:["snapshot","owner","device"]
};
function plain(value){
  if(!value || typeof value!=="object" || Array.isArray(value)) throw Error("Invalid source object");
  return value;
}
function json(value){
  const text=JSON.stringify(value);
  if(text===undefined || !isDeepStrictEqual(JSON.parse(text),value)) throw Error("Unrepresentable JSON source");
  return text;
}
function rows(db,table){
  if(!db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(table))return [];
  return db.prepare('SELECT * FROM "'+table+'"').all();
}
function kv(db,k){
  if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE name='_cf_KV'").get())return undefined;
  const r=db.prepare("SELECT value FROM _cf_KV WHERE key=?").get(k);
  return r?deserialize(r.value):undefined;
}
function projectOne(db,ns,name,snapshot,out) {
 const add=(table,...values)=>out[table].push(values);
 if(ns.endsWith("-Credentials"))for(const r of rows(db,"credentials_v1"))
   add("accounts",r.email_id,r.email,r.username,r.salt,r.proof,r.password_key??"legacy",r.created_at);
 if(ns.endsWith("-EmailAccount")){
   const state=kv(db,"care-sync")??{revision:0,records:null};
   if(!Number.isSafeInteger(state.revision)||state.revision<0)throw Error("Invalid revision");
   add("legacy_people",snapshot,name,rows(db,"account_reset")[0]?.epoch??null,kv(db,"care-zone")??null,state.revision);
   for(const r of rows(db,"sessions"))add("legacy_sessions",snapshot,name,r.hash,r.expires);
   for(const id of kv(db,"reminder-devices")??[])add("account_devices",snapshot,name,id);
   for(const [kind,v] of Object.entries(state.records??{})){
     if(kind==="water")for(const r of v) {
       if(typeof r.id!=="string"||!r.id.length)throw Error("Missing stable water ID");
       add("legacy_care",snapshot,name,kind,r.id,json(r));
     }else if(["medicines","doses","visits","routines","routineLogs","cycleDays","cycleRecords","sleepRecords","settings"].includes(kind)){
       for(const [key,record] of Object.entries(plain(v)))add("legacy_care",snapshot,name,kind,key,json(record));
     }else add("legacy_care",snapshot,name,kind,"",json(v));
   }
 }
 if(ns.endsWith("-Families")){
   for(const r of rows(db,"family_groups"))add("households",snapshot,r.id,r.owner,r.name,r.icon??null);
   for(const r of rows(db,"family_members"))add("memberships",snapshot,r.id,r.group_id,r.person,r.label);
   for(const r of rows(db,"family_grants"))add("grants",snapshot,r.group_id,r.owner,r.recipient,json(JSON.parse(r.policy)),r.expires);
 }
 if(ns.endsWith("-MedicationReminders")){
   const state=kv(db,"state");
   if(state!==undefined)add("import_devices",snapshot,name,json(state));
 }
}

export async function projectArchive(client,dir,key,verifyOnly=false){
 const manifest=await readManifest(dir,key),snapshot=manifest.snapshot;
 if(!manifest.identities)throw Error("Authenticated object identities required");
 await importObjects(client,dir,key,true);
 const data=Object.fromEntries(Object.keys(columns).map(k=>[k,[]]));
 for(const entry of manifest.entries){
   if(entry.object==="metadata.sqlite")continue;
   const name=manifest.identities[entry.namespace]?.[entry.object];
   if(typeof name!=="string"||!name)throw Error("Missing identity");
   const target=await client.query("SELECT archive FROM medora.source_objects WHERE snapshot=$1 AND namespace=$2 AND object_id=$3",[snapshot,entry.namespace,entry.object]);
   const bytes=unseal(key,snapshot,entry,target.rows[0].archive);
   const db=new DatabaseSync(":memory:");
   try{db.deserialize(bytes);projectOne(db,entry.namespace,name,snapshot,data);}finally{db.close();bytes.fill(0);}
 }
 await client.query("BEGIN");
 try{
   await client.query("SELECT pg_advisory_xact_lock(694211261)");
   if(!verifyOnly) await client.query("INSERT INTO medora.imports(snapshot) VALUES($1) ON CONFLICT DO NOTHING",[snapshot]);
   const exists=await client.query("SELECT snapshot FROM medora.imports WHERE snapshot=$1",[snapshot]);
   if(!exists.rowCount)throw Error("Missing projection");
   for(const [table,fields] of Object.entries(columns)){
     // A temporary table inherits actual PostgreSQL types and uniqueness. Duplicate source identities fail closed.
     const scratch="src_"+table, list=fields.join(",");
     await client.query("CREATE TEMP TABLE "+scratch+" (LIKE medora."+table+" INCLUDING ALL) ON COMMIT DROP");
     for(let i=0;i<data[table].length;i+=100){
       const block=data[table].slice(i,i+100);
       const tuples=block.map((row,j)=>"("+row.map((_,k)=>"$"+(j*fields.length+k+1)).join(",")+")");
       await client.query("INSERT INTO "+scratch+"("+list+") VALUES "+tuples.join(","),block.flat());
     }
     if(!verifyOnly)await client.query("INSERT INTO medora."+table+"("+list+") SELECT "+list+" FROM "+scratch+" ON CONFLICT DO NOTHING");
     const scope=table==="accounts"?"id IN (SELECT id FROM "+scratch+")":"snapshot=$1";
     const expected="SELECT "+list+" FROM "+scratch;
     const actual="SELECT "+list+" FROM medora."+table+" WHERE "+scope;
     const mismatches=await client.query("("+expected+" EXCEPT ALL "+actual+") UNION ALL ("+actual+" EXCEPT ALL "+expected+") LIMIT 1",table==="accounts"?[]:[snapshot]);
     if(mismatches.rowCount)throw Error("Projection differs in "+table);
   }
   await client.query("COMMIT");
   return Object.fromEntries(Object.entries(data).map(([t,rs])=>[t,rs.length]));
 }catch(error){await client.query("ROLLBACK");throw error;}
}
