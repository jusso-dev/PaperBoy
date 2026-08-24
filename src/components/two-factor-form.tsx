"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type VerificationMethod = "backup" | "totp";

export function TwoFactorForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [method, setMethod] = useState<VerificationMethod>("totp");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code")).trim();
    const trustDevice = form.get("trustDevice") === "on";
    const result =
      method === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({
            code,
            disableSession: false,
            trustDevice,
          });

    if (result.error) {
      setError(
        result.error.code === "ACCOUNT_TEMPORARILY_LOCKED"
          ? "Too many failed attempts. This account is temporarily locked for 15 minutes."
          : method === "totp"
            ? "That authenticator code is invalid or expired."
            : "That backup code is invalid or has already been used.",
      );
      setIsPending(false);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <section className="auth-card" aria-labelledby="two-factor-title">
      <p className="auth-kicker">Second factor</p>
      <h1 id="two-factor-title">Verify it’s you</h1>
      <p className="auth-intro">
        Enter a code from your authenticator app, or use one recovery code.
      </p>

      <div className="auth-methods" role="group" aria-label="Verification method">
        <button
          aria-pressed={method === "totp"}
          className="btn"
          onClick={() => {
            setError(null);
            setMethod("totp");
          }}
          type="button"
        >
          Authenticator code
        </button>
        <button
          aria-pressed={method === "backup"}
          className="btn"
          onClick={() => {
            setError(null);
            setMethod("backup");
          }}
          type="button"
        >
          Recovery code
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="two-factor-code">
            {method === "totp" ? "Six-digit code" : "Recovery code"}
          </label>
          <input
            autoComplete="one-time-code"
            autoFocus
            id="two-factor-code"
            inputMode={method === "totp" ? "numeric" : "text"}
            maxLength={method === "totp" ? 6 : 64}
            minLength={method === "totp" ? 6 : 4}
            name="code"
            pattern={method === "totp" ? "[0-9]{6}" : undefined}
            required
            type="text"
          />
        </div>

        <label className="checkbox-row">
          <input name="trustDevice" type="checkbox" />
          Trust this device for 30 days
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="btn btn-primary auth-submit"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Verifying…" : "Verify and continue"}
        </button>
      </form>
    </section>
  );
}
