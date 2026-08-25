"use client";

import { useActionState } from "react";
import type { TemplatePreviewState } from "./actions";
import { templateBrowserPreviewDocument } from "@/lib/template-browser-preview";

type TemplatePreviewFormProps = {
  action: (
    state: TemplatePreviewState,
    formData: FormData,
  ) => Promise<TemplatePreviewState>;
  initialData: string;
  initialState: TemplatePreviewState;
};

export function TemplatePreviewForm({
  action,
  initialData,
  initialState,
}: TemplatePreviewFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <>
      <form action={formAction} className="card template-preview-form">
        <h2>Sample JSON</h2>
        <div className="field">
          <label htmlFor="template-preview-data">Template data</label>
          <textarea
            defaultValue={initialData}
            id="template-preview-data"
            name="data"
            rows={12}
            spellCheck={false}
          />
          <p className="field-help">
            Preview validates and renders only. It never queues or sends mail.
          </p>
        </div>
        <button className="btn btn-primary" disabled={pending} type="submit">
          {pending ? "Rendering…" : "Render preview"}
        </button>
      </form>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <section className="card template-preview-output" aria-live="polite">
        <h2>Rendered preview</h2>
        {state.missingVariables.length > 0 ? (
          <div className="form-error" role="status">
            <strong>Missing required variables</strong>
            <ul>
              {state.missingVariables.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="form-success" role="status">
            All required variables are present.
          </p>
        )}

        <h3>Subject</h3>
        <pre>{state.subject}</pre>

        {state.html !== null ? (
          <>
            <h3>HTML</h3>
            <iframe
              referrerPolicy="no-referrer"
              sandbox=""
              srcDoc={templateBrowserPreviewDocument(state.html)}
              title="Rendered email HTML preview"
            />
            <details>
              <summary>View rendered HTML source</summary>
              <pre>{state.html}</pre>
            </details>
          </>
        ) : null}

        {state.text !== null ? (
          <>
            <h3>Plain text</h3>
            <pre>{state.text}</pre>
          </>
        ) : null}
      </section>
    </>
  );
}
