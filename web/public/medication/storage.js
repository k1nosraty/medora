const initial = () => ({ medicines: {}, doses: {} });

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("medora-medication-prototype", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("care");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Storage blocked"));
  });
}

export async function accessCare(change) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("care", change ? "readwrite" : "readonly");
      const store = transaction.objectStore("care");
      const read = store.get("state");
      let value;
      let error;
      read.onsuccess = () => {
        try {
          value = read.result ?? initial();
          if (change) {
            change(value);
            store.put(value, "state");
          }
        } catch (cause) {
          error = cause;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(error ?? transaction.error);
    });
  } finally {
    db.close();
  }
}
