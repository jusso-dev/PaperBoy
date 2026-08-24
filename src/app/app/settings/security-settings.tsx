"use client";

import { getAuthenticatorName } from "@better-auth/passkey";
import QRCode from "react-qr-code";
import { type FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type PasskeyRecord = {
  aaguid?: string | null;
  backedUp: boolean;
  createdAt: Date | string;
  deviceType: string;
  id: string;
  name?: string | null;
};

type TotpEnrollment = {
  backupCodes: string[];
  totpURI: string;
};

function password(form: FormData): string {
  return String(form.get("password"));
}

export function SecuritySettings({
  initialPasskeys,
  initialTwoFactorEnabled,
  passkeyOrigin,
  timeZone,
}: {
  initialPasskeys: PasskeyRecord[];
  initialTwoFactorEnabled: boolean;
  passkeyOrigin: string;
  timeZone: string;
}) {
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>(initialPasskeys);
  const [status, setStatus] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    initialTwoFactorEnabled,
  );

  function begin() {
    setError(null);
    setStatus(null);
    setIsPending(true);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    begin();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword"));
    const newPassword = String(form.get("newPassword"));
    const confirmation = String(form.get("confirmPassword"));

    if (newPassword !== confirmation) {
      setError("New password and confirmation do not match.");
      setIsPending(false);
      return;
    }

    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (result.error) {
      setError(
        result.error.message ||
          "Password could not be changed. Check your current password.",
      );
      setIsPending(false);
      return;
    }

    event.currentTarget.reset();
    setStatus("Password changed. Other signed-in devices were signed out.");
    setIsPending(false);
  }

  async function enableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    begin();
    const form = new FormData(event.currentTarget);
    const result = await authClient.twoFactor.enable({
      issuer: "PaperBoy",
      method: "totp",
      password: password(form),
    });
    if (result.error || result.data?.method !== "totp") {
      setError("Two-factor setup could not start. Check your password.");
      setIsPending(false);
      return;
    }
    setEnrollment({
      backupCodes: result.data.backupCodes ?? [],
      totpURI: result.data.totpURI,
    });
    setBackupCodes(result.data.backupCodes ?? []);
    setStatus("Scan the QR code, then verify one authenticator code.");
    setIsPending(false);
  }

  async function confirmTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    begin();
    const form = new FormData(event.currentTarget);
    const result = await authClient.twoFactor.verifyTotp({
      code: String(form.get("code")).trim(),
      trustDevice: false,
    });
    if (result.error) {
      setError("That authenticator code is invalid or expired.");
      setIsPending(false);
      return;
    }
    setEnrollment(null);
    setTwoFactorEnabled(true);
    setStatus("Two-factor authentication is enabled. Save the recovery codes now.");
    setIsPending(false);
  }

  async function disableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    begin();
    const result = await authClient.twoFactor.disable({
      password: password(new FormData(event.currentTarget)),
    });
    if (result.error) {
      setError("Two-factor authentication could not be disabled. Check your password.");
      setIsPending(false);
      return;
    }
    setBackupCodes([]);
    setEnrollment(null);
    setTwoFactorEnabled(false);
    setStatus("Two-factor authentication is disabled.");
    setIsPending(false);
  }

  async function regenerateBackupCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    begin();
    const result = await authClient.twoFactor.generateBackupCodes({
      password: password(new FormData(event.currentTarget)),
    });
    if (result.error) {
      setError("Recovery codes could not be regenerated. Check your password.");
      setIsPending(false);
      return;
    }
    setBackupCodes(result.data?.backupCodes ?? []);
    setStatus("Old recovery codes are invalid. Save this new set now.");
    setIsPending(false);
  }

  async function addPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    begin();
    const form = new FormData(event.currentTarget);
    const result = await authClient.passkey.addPasskey({
      name: String(form.get("name")).trim() || undefined,
    });
    if (result.error) {
      setError(
        result.error.message ||
          "Passkey registration was cancelled or could not be verified.",
      );
      setIsPending(false);
      return;
    }
    event.currentTarget.reset();
    if (result.data) setPasskeys((current) => [...current, result.data]);
    setStatus("Passkey added. You can use it from the sign-in page.");
    setIsPending(false);
  }

  async function deletePasskey(passkey: PasskeyRecord) {
    const label =
      passkey.name || getAuthenticatorName(passkey.aaguid) || "this passkey";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    begin();
    const result = await authClient.passkey.deletePasskey({ id: passkey.id });
    if (result.error) {
      setError("The passkey could not be deleted.");
      setIsPending(false);
      return;
    }
    setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
    setStatus("Passkey deleted.");
    setIsPending(false);
  }

  async function copyBackupCodes() {
    begin();
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setStatus("Recovery codes copied. Store them somewhere secure.");
    } catch {
      setError("Recovery codes could not be copied. Select and save them manually.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="security-stack">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="form-success" role="status">
          {status}
        </p>
      ) : null}

      <section className="security-section" aria-labelledby="password-heading">
        <h3 id="password-heading">Password</h3>
        <p>Change your password and sign out every other active session.</p>
        <form className="settings-form" onSubmit={changePassword}>
          <div className="field">
            <label htmlFor="password-current">Current password</label>
            <input
              autoComplete="current-password"
              id="password-current"
              maxLength={128}
              name="currentPassword"
              required
              type="password"
            />
          </div>
          <div className="field">
            <label htmlFor="password-new">New password</label>
            <input
              autoComplete="new-password"
              id="password-new"
              maxLength={128}
              minLength={8}
              name="newPassword"
              required
              type="password"
            />
          </div>
          <div className="field">
            <label htmlFor="password-confirm">Confirm new password</label>
            <input
              autoComplete="new-password"
              id="password-confirm"
              maxLength={128}
              minLength={8}
              name="confirmPassword"
              required
              type="password"
            />
          </div>
          <button className="btn btn-primary" disabled={isPending} type="submit">
            Change password
          </button>
        </form>
      </section>

      <section className="security-section" aria-labelledby="mfa-heading">
        <h3 id="mfa-heading">Authenticator MFA</h3>
        <p>
          Password sign-in requires a rotating authenticator code when enabled.
          Five failed challenges lock the account for 15 minutes.
        </p>

        {!twoFactorEnabled && !enrollment ? (
          <form className="settings-form" onSubmit={enableTwoFactor}>
            <div className="field">
              <label htmlFor="mfa-enable-password">Current password</label>
              <input
                autoComplete="current-password"
                id="mfa-enable-password"
                name="password"
                required
                type="password"
              />
            </div>
            <button className="btn btn-primary" disabled={isPending} type="submit">
              Set up authenticator MFA
            </button>
          </form>
        ) : null}

        {enrollment ? (
          <div className="totp-enrollment">
            <div className="qr-code" aria-label="Authenticator setup QR code">
              <QRCode size={184} value={enrollment.totpURI} />
            </div>
            <details>
              <summary>Can’t scan the QR code?</summary>
              <code className="secret-uri">{enrollment.totpURI}</code>
            </details>
            <form className="settings-form" onSubmit={confirmTwoFactor}>
              <div className="field">
                <label htmlFor="mfa-confirm-code">Six-digit code</label>
                <input
                  autoComplete="one-time-code"
                  id="mfa-confirm-code"
                  inputMode="numeric"
                  maxLength={6}
                  minLength={6}
                  name="code"
                  pattern="[0-9]{6}"
                  required
                  type="text"
                />
              </div>
              <button className="btn btn-primary" disabled={isPending} type="submit">
                Verify and enable
              </button>
            </form>
          </div>
        ) : null}

        {twoFactorEnabled ? (
          <div className="security-actions">
            <p><span className="pill">Enabled</span></p>
            <form className="settings-form" onSubmit={regenerateBackupCodes}>
              <div className="field">
                <label htmlFor="mfa-backup-password">Current password</label>
                <input
                  autoComplete="current-password"
                  id="mfa-backup-password"
                  name="password"
                  required
                  type="password"
                />
              </div>
              <button className="btn" disabled={isPending} type="submit">
                Generate new recovery codes
              </button>
            </form>
            <form className="settings-form" onSubmit={disableTwoFactor}>
              <div className="field">
                <label htmlFor="mfa-disable-password">Current password</label>
                <input
                  autoComplete="current-password"
                  id="mfa-disable-password"
                  name="password"
                  required
                  type="password"
                />
              </div>
              <button className="btn btn-danger" disabled={isPending} type="submit">
                Disable MFA
              </button>
            </form>
          </div>
        ) : null}

        {backupCodes.length > 0 ? (
          <div className="backup-codes" role="region" aria-label="Recovery codes">
            <p><strong>Recovery codes</strong> — each works once.</p>
            <ul>
              {backupCodes.map((code) => <li key={code}><code>{code}</code></li>)}
            </ul>
            <button
              className="btn"
              disabled={isPending}
              onClick={copyBackupCodes}
              type="button"
            >
              Copy recovery codes
            </button>
          </div>
        ) : null}
      </section>

      <section className="security-section" aria-labelledby="passkeys-heading">
        <h3 id="passkeys-heading">Passkeys</h3>
        <p>
          Passkeys provide phishing-resistant sign-in using your device,
          password manager, or hardware security key. Ceremonies are bound to
          <span className="inline-url"> {passkeyOrigin}</span>.
        </p>
        <form className="settings-form" onSubmit={addPasskey}>
          <div className="field">
            <label htmlFor="passkey-name">Passkey name</label>
            <input
              id="passkey-name"
              maxLength={120}
              name="name"
              placeholder="Work MacBook"
              type="text"
            />
          </div>
          <button className="btn btn-primary" disabled={isPending} type="submit">
            Add passkey
          </button>
        </form>

        {passkeys.length === 0 ? (
          <p>No passkeys enrolled.</p>
        ) : (
          <ul className="passkey-list">
            {passkeys.map((passkey) => (
              <li key={passkey.id}>
                <div>
                  <strong>
                    {passkey.name ||
                      getAuthenticatorName(passkey.aaguid) ||
                      "Passkey"}
                  </strong>
                  <p>
                    Added {new Intl.DateTimeFormat("en-AU", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone,
                    }).format(new Date(passkey.createdAt))}
                    {passkey.backedUp ? " · synced" : " · device-bound"}
                  </p>
                </div>
                <button
                  className="btn btn-danger"
                  disabled={isPending}
                  onClick={() => deletePasskey(passkey)}
                  type="button"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
