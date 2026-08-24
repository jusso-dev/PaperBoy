"use client";

import { useActionState, useState } from "react";
import {
  createApiKeyAction,
  type CreateApiKeyState,
} from "./actions";

const initialState: CreateApiKeyState = {
  display: null,
  error: null,
  rawKey: null,
};

function SecretReveal({ rawKey }: { rawKey: string }) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Select the key and copy it manually.");
    }
  }

  return (
    <div className="key-secret" role="status">
      <p className="key-secret-title">Copy this key now</p>
      <p>PaperBoy will not show it again.</p>
      <code>{rawKey}</code>
      <div className="key-secret-actions">
        <button className="btn" onClick={copyKey} type="button">
          Copy key
        </button>
        {copyStatus ? <span aria-live="polite">{copyStatus}</span> : null}
      </div>
    </div>
  );
}

export function ApiKeyForm() {
  const [state, formAction, isPending] = useActionState(
    createApiKeyAction,
    initialState,
  );

  return (
    <>
      <form action={formAction} className="api-key-form">
        <div className="field">
          <label htmlFor="key-name">Key name</label>
          <input
            autoComplete="off"
            id="key-name"
            maxLength={80}
            name="name"
            placeholder="Automation"
            required
            type="text"
          />
        </div>
        <button className="btn btn-primary" disabled={isPending} type="submit">
          {isPending ? "Creating…" : "Create API key"}
        </button>
      </form>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.rawKey ? (
        <SecretReveal key={state.rawKey} rawKey={state.rawKey} />
      ) : null}
    </>
  );
}
