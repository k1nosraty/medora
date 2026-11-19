// Check at both ingress and the object boundary. A request accepted by an older
// ingress worker can still deliver RPC after the object has switched versions.
export function legacyWritesFenced(env) {
  const mode = env.MEDORA_LEGACY_WRITES_FENCED;
  return mode !== undefined && mode !== "false";
}

export function fencedObject(Base) {
  class Guarded extends Base {}
  for (const method of Object.getOwnPropertyNames(Base.prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(Base.prototype, method);
    if (method === "constructor" || typeof descriptor.value !== "function")
      continue;
    Object.defineProperty(Guarded.prototype, method, {
      ...descriptor,
      value: function (...args) {
        if (!legacyWritesFenced(this.env))
          return descriptor.value.apply(this, args);
        // Workerd consumes an alarm on dispatch. Leave its business state alone
        // and set a new wake-up so resuming the legacy writer can process it.
        if (method === "alarm")
          return this.ctx.storage.setAlarm(Date.now() + 60_000);
        return Promise.reject(new Error("legacy_writer_fenced"));
      },
    });
  }
  return Guarded;
}
