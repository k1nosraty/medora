import "fake-indexeddb/auto";
import { expect,test } from "vitest";
import { accessCare } from "../../web/public/medication/shared/storage.js";

test("legacy full and day-scoped writes preserve extensions even after the last known day entry is removed",async ()=>{
  await accessCare();
  const db=await new Promise<IDBDatabase>(resolve=>{
    const req=indexedDB.open("medora-medication-prototype");req.onsuccess=()=>resolve(req.result);
  });
  const tx=db.transaction(["care","days"],"readwrite");
  tx.objectStore("care").put({settings:{medicines:{}},revision:1,pending:["old"]},"state");
  tx.objectStore("days").put({day:10,water:[{id:"w",day:10,time:"09:00",amount:30}],doses:{},routines:{},future:new Uint8Array([1,2,3])});
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
  await accessCare((state:{water:unknown[]})=>{state.water=[];},{day:10});
  await accessCare((state:{waterGoal:number})=>{state.waterGoal=2000;});
  const read=db.transaction(["care","days"]);
  const day=read.objectStore("days").get(10),state=read.objectStore("care").get("state");
  await new Promise<void>(resolve=>{read.oncomplete=()=>resolve();});
  expect(day.result.future).toEqual(new Uint8Array([1,2,3]));
  expect(day.result.water).toEqual([]);expect(state.result.pending).toEqual(["old"]);db.close();
});
