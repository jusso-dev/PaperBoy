"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { browserTimeZone } from "@/lib/time";

type AuthMode = "sign-in" | "sign-up";

const copy = {
  "sign-in": {
    title: "Sign in",
    submit: "Sign in",
    pending: "Signing in…",
    prompt: "New to PaperBoy?",
    linkLabel: "Create an account",
    linkHref: "/sign-up",
  },
  "sign-up": {
    title: "Create your account",
    submit: "Create account",
    pending: "Creating account…",
    prompt: "Already have an account?",
    linkLabel: "Sign in",
    linkHref: "/sign-in",
  },
} as const;

export function AuthForm({
  allowSignUp = false,
  mode,
}: {
  allowSignUp?: boolean;
  mode: AuthMode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const labels = copy[mode];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ callbackURL: "/app", email, password })
        : await authClient.signUp.email({
            callbackURL: "/app",
            email,
            password,
            name: String(formData.get("name")),
            timezone: browserTimeZone(),
          });

    if (result.error) {
      setError(
        mode === "sign-in"
          ? "Email or password is incorrect."
          : "We could not create that account. Try signing in or use a different email.",
      );
      setIsPending(false);
      return;
    }

    if (
      mode === "sign-in" &&
      result.data &&
      "twoFactorRedirect" in result.data &&
      result.data.twoFactorRedirect
    ) {
      window.location.replace("/two-factor");
      return;
    }

    window.location.replace("/app");
  }

  async function handlePasskeySignIn() {
    setError(null);
    setIsPending(true);
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setError(
        result.error.message ||
          "Passkey sign-in was cancelled or could not be verified.",
      );
      setIsPending(false);
      return;
    }
    window.location.replace("/app");
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="auth-kicker">Console access</p>
      <h1 id="auth-title">{labels.title}</h1>
      <p className="auth-intro">
        Your sending domains, API keys, and delivery logs stay behind this
        desk.
      </p>

      <form onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              autoComplete="name"
              id="name"
              name="name"
              required
              type="text"
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            autoComplete={mode === "sign-in" ? "username webauthn" : "email"}
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            autoComplete={
              mode === "sign-in"
                ? "current-password webauthn"
                : "new-password"
            }
            id="password"
            maxLength={128}
            minLength={8}
            name="password"
            required
            type="password"
          />
          {mode === "sign-up" ? (
            <p className="field-help">Use at least 8 characters.</p>
          ) : null}
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn btn-primary auth-submit" disabled={isPending} type="submit">
          {isPending ? labels.pending : labels.submit}
        </button>
      </form>

      {mode === "sign-in" ? (
        <>
          <p className="auth-divider" aria-hidden="true">
            or
          </p>
          <button
            className="btn auth-submit"
            disabled={isPending}
            onClick={handlePasskeySignIn}
            type="button"
          >
            Sign in with a passkey
          </button>
        </>
      ) : null}

      {mode === "sign-up" || allowSignUp ? (
        <p className="auth-switch">
          {labels.prompt} <Link href={labels.linkHref}>{labels.linkLabel}</Link>
        </p>
      ) : null}
    </section>
  );
}
