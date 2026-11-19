import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { t } from "../../product-assets/public/medication/shared/i18n/locale.js";

export type CredentialForm =
  "login" | "email" | "code" | "setup" | "resetEmail" | "resetCode";
export type AccountScreen = CredentialForm | "session" | "loading";
export type CredentialAction =
  | "forgot-password"
  | "reset-change-email"
  | "reset-resend"
  | "email-change"
  | "email-resend"
  | "setup-back"
  | "reset-back";

interface Props {
  screen: AccountScreen;
  recipient: string;
  registrationAvailable: boolean;
  busy: boolean;
  navigate(screen: "login" | "email"): void;
  submit(event: FormEvent<HTMLFormElement>, form: CredentialForm): void;
  action(action: CredentialAction): void;
  passwordReset: number;
}

export function AccountCredentials({
  screen,
  recipient,
  registrationAvailable,
  busy,
  navigate,
  submit,
  action,
  passwordReset,
}: Props) {
  return (
    <>
      <div
        className="account-modes"
        id="account-modes"
        role="group"
        aria-label={t("ui.sign-in-or-create-an-account")}
        hidden={
          !registrationAvailable || (screen !== "login" && screen !== "email")
        }
      >
        <button
          disabled={busy}
          type="button"
          data-account-mode="login"
          aria-pressed={screen === "login"}
          onClick={() => navigate("login")}
        >
          {t("ui.sign-in")}
        </button>
        <button
          disabled={busy}
          type="button"
          data-account-mode="email"
          aria-pressed={screen === "email"}
          onClick={() => navigate("email")}
        >
          {t("ui.create-account")}
        </button>
      </div>
      <form
        id="password-login"
        className="account-form"
        method="post"
        hidden={screen !== "login"}
        onSubmit={(event) => submit(event, "login")}
      >
        <label>
          {t("ui.username")}
          <input
            id="login-username"
            name="username"
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={32}
            required
          />
        </label>
        <PasswordField id="login-password" reset={passwordReset} current />
        <button
          disabled={busy}
          type="submit"
          className="block-action account-primary"
        >
          {t("ui.sign-in-to-medora")}
        </button>
        <button
          disabled={busy}
          type="button"
          className="text-button"
          id="forgot-password"
          onClick={() => action("forgot-password")}
        >
          {t("ui.forgot-password")}
        </button>
      </form>
      <form
        id="reset-email-form"
        className="account-form"
        method="post"
        hidden={screen !== "resetEmail"}
        onSubmit={(event) => submit(event, "resetEmail")}
      >
        <label>
          {t("ui.email-address")}
          <input
            id="reset-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        <button
          disabled={busy}
          type="submit"
          className="block-action account-primary"
        >
          {t("ui.send-recovery-code")}
        </button>
        <button
          disabled={busy}
          type="button"
          className="text-button"
          data-reset-back=""
          onClick={() => action("reset-back")}
        >
          {t("ui.back-to-sign-in")}
        </button>
      </form>
      <form
        id="reset-password-form"
        className="account-form"
        method="post"
        hidden={screen !== "resetCode"}
        onSubmit={(event) => submit(event, "resetCode")}
      >
        <p className="quiet">
          {t("ui.if-this-email-is-linked-to-an-account-it-will-receive-a-r")}
        </p>
        <label>
          {t("ui.6-digit-code")}
          <input
            id="reset-code"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9۰-۹٠-٩]{6}"
            required
          />
        </label>
        <PasswordField id="reset-password" reset={passwordReset} />
        <p className="quiet">
          {t("ui.use-at-least-15-characters-a-long-passphrase-works-well")}
        </p>
        <button
          disabled={busy}
          type="submit"
          className="block-action account-primary"
        >
          {t("ui.save-new-password")}
        </button>
        <div className="account-options">
          <button
            disabled={busy}
            type="button"
            className="text-button"
            id="reset-change-email"
            onClick={() => action("reset-change-email")}
          >
            {t("ui.change-email")}
          </button>
          <button
            disabled={busy}
            type="button"
            className="text-button"
            id="reset-resend"
            onClick={() => action("reset-resend")}
          >
            {t("ui.resend-code")}
          </button>
        </div>
        <button
          disabled={busy}
          type="button"
          className="text-button"
          data-reset-back=""
          onClick={() => action("reset-back")}
        >
          {t("ui.back-to-sign-in")}
        </button>
      </form>
      <form
        id="email-start"
        className="account-form"
        hidden={screen !== "email"}
        onSubmit={(event) => submit(event, "email")}
      >
        <label>
          {t("ui.email-address")}
          <input
            id="account-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        <p className="quiet">
          {t("ui.verify-your-email-once-then-choose-a-username-and-passwor")}
        </p>
        <button
          disabled={busy}
          type="submit"
          className="block-action account-primary"
        >
          {t("ui.send-verification-code")}
        </button>
      </form>
      <form
        id="email-verify"
        className="account-form"
        hidden={screen !== "code"}
        onSubmit={(event) => submit(event, "code")}
      >
        <p className="quiet">
          {t("ui.enter-the-code-sent-to")}{" "}
          <bdi id="account-recipient">{recipient}</bdi> {t("ui.label")}
        </p>
        <label>
          {t("ui.6-digit-code")}
          <input
            id="account-code"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9۰-۹٠-٩]{6}"
            required
          />
        </label>
        <button
          disabled={busy}
          type="submit"
          className="block-action account-primary"
        >
          {t("ui.verify-email")}
        </button>
        <div className="account-options">
          <button
            disabled={busy}
            type="button"
            className="text-button"
            id="email-change"
            onClick={() => action("email-change")}
          >
            {t("ui.change-email")}
          </button>
          <button
            disabled={busy}
            type="button"
            className="text-button"
            id="email-resend"
            onClick={() => action("email-resend")}
          >
            {t("ui.resend-code")}
          </button>
        </div>
      </form>
      <form
        id="password-register"
        className="account-form"
        method="post"
        hidden={screen !== "setup"}
        onSubmit={(event) => submit(event, "setup")}
      >
        <label>
          {t("ui.username")}
          <input
            id="register-username"
            name="username"
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            pattern="[A-Za-z0-9_]{3,32}"
            maxLength={32}
            aria-describedby="username-hint"
            required
          />
        </label>
        <p className="quiet" id="username-hint">
          {t("ui.use-332-letters-numbers-or-underscores")}
        </p>
        <PasswordField
          id="register-password"
          reset={passwordReset}
          describedBy="password-hint"
        />
        <p className="quiet" id="password-hint">
          {t("ui.use-at-least-15-characters-a-long-passphrase-works-well")}
        </p>
        <button
          disabled={busy}
          type="submit"
          className="block-action account-primary"
        >
          {t("ui.save-username-and-password")}
        </button>
        <button
          disabled={busy}
          type="button"
          className="text-button"
          id="setup-back"
          onClick={() => action("setup-back")}
        >
          {t("ui.back")}
        </button>
      </form>
    </>
  );
}

function PasswordField({
  id,
  reset,
  current = false,
  describedBy,
}: {
  id: string;
  reset: number;
  current?: boolean;
  describedBy?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current!.value = "";
    setRevealed(false);
  }, [reset]);
  return (
    <div className="account-password">
      <label>
        {t(id === "reset-password" ? "ui.new-password" : "ui.password")}
        <input
          ref={input}
          id={id}
          name={id === "reset-password" ? undefined : "password"}
          type={revealed ? "text" : "password"}
          dir="auto"
          autoComplete={current ? "current-password" : "new-password"}
          minLength={current ? undefined : 15}
          maxLength={128}
          aria-describedby={describedBy}
          required
        />
      </label>
      <button
        type="button"
        className="text-button"
        data-reveal-password={id}
        aria-controls={id}
        aria-pressed={revealed}
        onClick={() => setRevealed(!revealed)}
      >
        {t(revealed ? "پنهان کردن" : "ui.show")}
      </button>
    </div>
  );
}
