"use client";

import { useState } from "react";
import { templateBrowserPreviewDocument } from "@/lib/template-browser-preview";

type TemplateHtmlEditorProps = {
  defaultValue?: string;
  id: string;
  label?: string;
  placeholder?: string;
};

export function TemplateHtmlEditor({
  defaultValue = "",
  id,
  label = "HTML",
  placeholder,
}: TemplateHtmlEditorProps) {
  const [html, setHtml] = useState(defaultValue);

  return (
    <section className="template-html-workbench" aria-label={`${label} editor and live preview`}>
      <div className="field template-html-source">
        <label htmlFor={id}>{label}</label>
        <textarea
          defaultValue={defaultValue}
          id={id}
          maxLength={2 * 1024 * 1024}
          name="html"
          onChange={(event) => setHtml(event.currentTarget.value)}
          placeholder={placeholder}
          rows={12}
          spellCheck={false}
        />
        <p className="field-help">
          Paste a complete email document or an HTML fragment. Inline styles and
          data images render; external requests and scripts stay blocked.
        </p>
      </div>

      <div className="template-html-preview">
        <header>
          <div>
            <strong>Browser preview</strong>
            <small>Sandboxed and updated as you type</small>
          </div>
          <span aria-label="Preview updates live">Live</span>
        </header>
        <iframe
          referrerPolicy="no-referrer"
          sandbox=""
          srcDoc={templateBrowserPreviewDocument(html, { showEmptyState: true })}
          title={`${label} browser preview`}
        />
      </div>
    </section>
  );
}
