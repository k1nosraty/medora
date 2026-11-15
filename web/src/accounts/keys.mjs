const isKey = value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const isVersion = value => typeof value === "string" && /^[a-z0-9-]{1,32}$/.test(value);

export const identityKey = env => env.EMAIL_ACCOUNT_ID_KEY ?? env.EMAIL_AUTH_SECRET;
export const sessionKey = env => env.EMAIL_SESSION_KEY ?? env.EMAIL_AUTH_SECRET;
export const codeKey = env => env.EMAIL_CODE_KEY ?? env.EMAIL_AUTH_SECRET;
export const passwordVersion = env => env.EMAIL_PASSWORD_KEY_ID ?? "legacy";
export function passwordKey(env, version = passwordVersion(env)) {
  if (version === passwordVersion(env)) return env.EMAIL_PASSWORD_KEY ?? env.EMAIL_AUTH_SECRET;
  if (version === env.EMAIL_PREVIOUS_PASSWORD_KEY_ID) return env.EMAIL_PREVIOUS_PASSWORD_KEY;
  if (version === "legacy" && env.EMAIL_ALLOW_LEGACY_PASSWORDS !== "false") return env.EMAIL_AUTH_SECRET;
  return undefined;
}

export function validAuthKeys(env) {
  return [identityKey(env), sessionKey(env), codeKey(env), passwordKey(env)].every(isKey) &&
    isVersion(passwordVersion(env)) && (!env.EMAIL_PASSWORD_KEY || passwordVersion(env) !== "legacy") &&
    Boolean(env.EMAIL_PREVIOUS_PASSWORD_KEY_ID) === Boolean(env.EMAIL_PREVIOUS_PASSWORD_KEY) &&
    (!env.EMAIL_PREVIOUS_PASSWORD_KEY || (isKey(env.EMAIL_PREVIOUS_PASSWORD_KEY) &&
      isVersion(env.EMAIL_PREVIOUS_PASSWORD_KEY_ID) && env.EMAIL_PREVIOUS_PASSWORD_KEY_ID !== passwordVersion(env)));
}

export const authKeyNames = [
  "EMAIL_AUTH_SECRET", "EMAIL_ACCOUNT_ID_KEY", "EMAIL_SESSION_KEY", "EMAIL_CODE_KEY",
  "EMAIL_PASSWORD_KEY", "EMAIL_PASSWORD_KEY_ID", "EMAIL_PREVIOUS_PASSWORD_KEY",
  "EMAIL_PREVIOUS_PASSWORD_KEY_ID", "EMAIL_ALLOW_LEGACY_PASSWORDS"
];
