export const operations = env => env.OPERATIONS?.getByName("operations");

export function logOperation(env, actor, action) {
  return operations(env)?.audit(actor, action).catch(() => {});
}
