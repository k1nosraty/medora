// Original workers use the same-origin account and care endpoints.
export const accountTransport = (path, options) => fetch(path, options);

export async function productPath(path) { return path; }
