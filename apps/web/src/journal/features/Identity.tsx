import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useApp } from "../context";

import { submitIdentity } from "../services/account";
export default function Identity() {
  const { t, notice } = useApp();
  const [purpose, setPurpose] = useState<"register" | "reset">("register");
  const [challenge, setChallenge] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (challenge) {
        await submitIdentity("verify", {
          challenge,
          code: String(data.get("code")).replace(/[۰-۹٠-٩]/g, (d) =>
            String(d.charCodeAt(0) & 15),
          ),
          password: data.get("password"),
          ...(purpose === "register" && { username: data.get("username") }),
        });
        setChallenge(null);
        notice(t.signInNow);
      } else {
        const value = await submitIdentity("challenges", {
          purpose,
          email: data.get("email"),
        });
        setChallenge(value.challenge);
        notice(t.checkEmail);
      }
    },
    onError: () => notice(t.error),
  });
  return (
    <details className="panel">
      <summary>{t.registration}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(new FormData(e.currentTarget));
        }}
      >
        {!challenge ? (
          <>
            <label>
              {t.action}
              <select
                value={purpose}
                onChange={(e) =>
                  setPurpose(e.target.value === "reset" ? "reset" : "register")
                }
              >
                <option value="register">{t.register}</option>
                <option value="reset">{t.reset}</option>
              </select>
            </label>
            <label>
              {t.email}
              <input
                type="email"
                dir="ltr"
                name="email"
                autoComplete="email"
                required
              />
            </label>
          </>
        ) : (
          <>
            <label>
              {t.code}
              <input
                dir="ltr"
                inputMode="numeric"
                name="code"
                autoComplete="one-time-code"
                required
                maxLength={6}
              />
            </label>
            {purpose === "register" && (
              <label>
                {t.username}
                <input
                  name="username"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_]+"
                />
              </label>
            )}
            <label>
              {t.newPassword}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={15}
                maxLength={128}
              />
            </label>
          </>
        )}
        <button disabled={mutation.isPending}>
          {challenge ? t.save : t.sendCode}
        </button>
        {challenge && (
          <button
            type="button"
            className="secondary"
            onClick={() => setChallenge(null)}
          >
            {t.cancel}
          </button>
        )}
      </form>
    </details>
  );
}
