import type { Delivery, IdentitySettings } from "./identity";
import { passwordKeys } from "./settings";
export interface MailEnv {
  MEDORA_CODE_KEY?: string;
  MEDORA_MAIL_KEY?: string;
  MEDORA_PASSWORD_KEYS?: string;
  MEDORA_CURRENT_PASSWORD_KEY?: string;
  MEDORA_FROM?: string;
  MEDORA_MAILPIT?: string;
  RESEND_API_KEY?: string;
}
export function mailConfiguration(env: MailEnv) {
  if (!env.MEDORA_CODE_KEY && !env.MEDORA_MAIL_KEY) return undefined;
  const id = env.MEDORA_CURRENT_PASSWORD_KEY ?? "legacy",
    pw = passwordKeys(env.MEDORA_PASSWORD_KEYS)[id];
  if (
    !pw ||
    !env.MEDORA_CODE_KEY ||
    !env.MEDORA_MAIL_KEY ||
    !env.MEDORA_FROM ||
    (!env.MEDORA_MAILPIT && !env.RESEND_API_KEY)
  )
    throw Error("Incomplete mail configuration");
  const settings: IdentitySettings = {
    codeKey: env.MEDORA_CODE_KEY,
    passwordKey: pw,
    passwordKeyId: id,
    mailKey: env.MEDORA_MAIL_KEY,
  };
  const deliver: Delivery = async (mail, job) => {
    const text = "کد تأیید مدورا\n" + mail.code + "\nMedora verification code";
    const local = env.MEDORA_MAILPIT;
    const response = await fetch(
      local ? new URL("/api/v1/send", local) : "https://api.resend.com/emails",
      {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          ...(local
            ? {}
            : {
                Authorization: "Bearer " + env.RESEND_API_KEY,
                "Idempotency-Key": job,
              }),
        },
        body: JSON.stringify(
          local
            ? {
                From: { Email: env.MEDORA_FROM },
                To: [{ Email: mail.email }],
                Subject: "Medora",
                Text: text,
              }
            : {
                from: env.MEDORA_FROM,
                to: [mail.email],
                subject: "Medora",
                text,
              },
        ),
      },
    );
    if (!response.ok) throw Error("mail_provider_unavailable");
  };
  return { settings, deliver };
}
