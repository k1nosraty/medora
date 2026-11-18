import "fake-indexeddb/auto";
import {expect,it} from "vitest";
import {captureLegacy,legacyName,type Image} from "../../apps/web/src/storage/legacy";
import {DeviceArchive,archiveImage} from "../../apps/web/src/storage/archive";

it("captures all object stores without upgrading a historical database",async()=>{
  const r=indexedDB.open(legacyName,1);
  r.onupgradeneeded=()=>{r.result.createObjectStore("care");r.result.createObjectStore("pending",{keyPath:"id"});};
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const tx=db.transaction(["care","pending"],"readwrite");
  tx.objectStore("care").put({medicines:{},water:[],custom:13},"state");tx.objectStore("pending").put({id:"offline",opaque:new Uint8Array([4,5])});
  await new Promise<void>(resolve=>{tx.oncomplete=()=>resolve();});db.close();
  const image=await captureLegacy({} as Storage);
  expect(image.version).toBe(1);expect(image.rows).toHaveLength(2);
  const target=new DeviceArchive("history-"+crypto.randomUUID()); const report=await archiveImage(target,image);
  expect((await target.rows.get([report.id,1]))?.value).toEqual({id:"offline",opaque:new Uint8Array([4,5])});
  expect(await indexedDB.databases()).toContainEqual({name:legacyName,version:1});target.close();
});
it("resumes an interrupted checkpoint and rejects corrupted target values",async()=>{
  const image:Image={version:3,schema:[],preferences:{"medora-language":"en"},rows:Array.from({length:301},(_,n)=>({store:"days",key:n,value:{day:n,pending:true,encrypted:"fixture-"+n}}))};
  const db=new DeviceArchive("resume-"+crypto.randomUUID());
  let once=true;
  db.rows.hook("creating",(_key,row)=>{if(once && row.ordinal===140){once=false;throw Error("interrupted");}});
  await expect(archiveImage(db,image)).rejects.toThrow();
  expect(await db.rows.count()).toBe(128);
  const report=await archiveImage(db,image); expect(report.count).toBe(301);
  expect(await archiveImage(db,image)).toEqual(report);
  await db.rows.update([report.id,1],{value:"changed"});
  await expect(archiveImage(db,image)).rejects.toThrow("reconciliation_failed");db.close();
});
