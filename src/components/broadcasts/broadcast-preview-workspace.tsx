"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Code2,
  FileText,
  Mail,
  Pencil,
  Send,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { CopyBroadcastHtml } from "@/components/broadcasts/copy-broadcast-html";
import { NaturalLanguageScheduleField } from "@/components/broadcasts/natural-language-schedule-field";
import { SandboxedHtmlPreview } from "@/components/broadcasts/sandboxed-html-preview";
import { WorkspaceWindow } from "@/components/broadcasts/workspace-window";
import {
  cancelBroadcastAction,
  sendBroadcastTestEmailAction,
  updateBroadcastAction,
} from "@/app/app/broadcasts/actions";
import {
  defaultBroadcastWindowLayout,
  type BroadcastWindowLayout,
  type WindowBounds,
} from "@/lib/broadcast-workspace-windows";
import type { BroadcastTestSendState } from "@/lib/broadcast-test-send";
import { templateBrowserPreviewDocument } from "@/lib/template-browser-preview";

type BroadcastPreviewWorkspaceProps = {
  audienceName: string;
  audiences: Array<{ activeContactCount: number; id: string; name: string }>;
  broadcastId: string;
  canCancel: boolean;
  canEdit: boolean;
  canSend: boolean;
  error?: string;
  from: string;
  html: string | null;
  name: string;
  scheduledLabel: string;
  scheduleInput: string;
  sourceAudienceId: string | null;
  status: string;
  subject: string;
  success?: string;
  referenceTime: string;
  text: string;
  timeZone: string;
  userEmail: string;
  userInitial: string;
};

const INITIAL_TEST_STATE: BroadcastTestSendState = {
  error: null,
  queuedId: null,
};

export function BroadcastPreviewWorkspace({
  audienceName,
  audiences,
  broadcastId,
  canCancel,
  canEdit,
  canSend,
  error,
  from,
  html,
  name,
  referenceTime,
  scheduledLabel,
  scheduleInput,
  sourceAudienceId,
  status,
  subject,
  success,
  text,
  timeZone,
  userEmail,
  userInitial,
}: BroadcastPreviewWorkspaceProps) {
  const deskRef = useRef<HTMLDivElement>(null);
  const [htmlValue, setHtmlValue] = useState(html ?? "");
  const [fromValue, setFromValue] = useState(from);
  const [subjectValue, setSubjectValue] = useState(subject);
  const previewDocument = templateBrowserPreviewDocument(htmlValue);
  const [bounds, setBounds] = useState<WindowBounds>({
    height: 800,
    width: 1200,
  });
  const [rects, setRects] = useState<BroadcastWindowLayout>(() =>
    defaultBroadcastWindowLayout({ height: 800, width: 1200 }),
  );
  const [zOrder, setZOrder] = useState<Array<keyof BroadcastWindowLayout>>([
    "envelope",
    "source",
    "preview",
  ]);
  const initialized = useRef(false);
  const [testState, testAction, testPending] = useActionState(
    sendBroadcastTestEmailAction,
    INITIAL_TEST_STATE,
  );
  const source = htmlValue || "<!-- This broadcast has no HTML body. -->";
  const sourceLines = source.split("\n");
  const focused = zOrder[zOrder.length - 1];

  useEffect(() => {
    const node = deskRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 1 || box.height < 1) return;
      const next = { height: box.height, width: box.width };
      setBounds(next);
      setRects((current) => {
        if (!initialized.current) {
          initialized.current = true;
          return defaultBroadcastWindowLayout(next);
        }
        return {
          envelope: {
            ...current.envelope,
            height: Math.min(current.envelope.height, next.height),
            width: Math.min(current.envelope.width, next.width),
            x: Math.min(current.envelope.x, Math.max(0, next.width - 80)),
            y: Math.min(current.envelope.y, Math.max(0, next.height - 80)),
          },
          preview: {
            ...current.preview,
            height: Math.min(current.preview.height, next.height),
            width: Math.min(current.preview.width, next.width),
            x: Math.min(current.preview.x, Math.max(0, next.width - 80)),
            y: Math.min(current.preview.y, Math.max(0, next.height - 80)),
          },
          source: {
            ...current.source,
            height: Math.min(current.source.height, next.height),
            width: Math.min(current.source.width, next.width),
            x: Math.min(current.source.x, Math.max(0, next.width - 80)),
            y: Math.min(current.source.y, Math.max(0, next.height - 80)),
          },
        };
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function focusWindow(id: keyof BroadcastWindowLayout) {
    setZOrder((current) => [
      ...current.filter((item) => item !== id),
      id,
    ]);
  }

  const testFields = (
    <>
      <input name="broadcastId" type="hidden" value={broadcastId} />
      <input name="from" type="hidden" value={fromValue} />
      <input name="html" type="hidden" value={htmlValue} />
      <input name="subject" type="hidden" value={subjectValue} />
      <input name="text" type="hidden" value={text} />
    </>
  );

  return (
    <section className="broadcast-workspace">
      <header className="broadcast-workspace-header">
        <Link aria-label="Back to broadcasts" className="broadcast-workspace-back" href="/app/broadcasts">
          <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
        </Link>
        <div className="broadcast-workspace-title">
          <Mail aria-hidden="true" strokeWidth={1.7} />
          <Link className="broadcast-workspace-brand" href="/app">PaperBoy</Link>
          <span aria-hidden="true" className="broadcast-workspace-crumb">/</span>
          <Link className="broadcast-workspace-crumb" href="/app/broadcasts">Broadcasts</Link>
          <span aria-hidden="true" className="broadcast-workspace-crumb">/</span>
          <strong title={name}>{name}</strong>
        </div>
        <span className="broadcast-workspace-status" data-status={status}>{status}</span>
        <div className="broadcast-workspace-actions">
          <span aria-hidden="true" className="broadcast-workspace-avatar">
            {userInitial}
          </span>
          {canSend ? (
            <form action={testAction} className="broadcast-workspace-test-form">
              {testFields}
              <label className="broadcast-workspace-test-to-label" htmlFor="broadcast-test-to">
                To
              </label>
              <input
                autoCapitalize="none"
                autoComplete="email"
                defaultValue={userEmail}
                id="broadcast-test-to"
                name="to"
                required
                spellCheck={false}
                type="email"
              />
              <button
                className="broadcast-workspace-test"
                disabled={testPending}
                type="submit"
              >
                {testPending ? "Sending…" : "Test email"}
              </button>
            </form>
          ) : null}
        </div>
        {testState.error ? (
          <p className="form-error broadcast-test-status" role="alert">
            {testState.error}
          </p>
        ) : null}
        {testState.queuedId ? (
          <p className="form-success broadcast-test-status" role="status">
            Test email {testState.queuedId} queued from {fromValue}.
          </p>
        ) : null}
      </header>

      <div className="broadcast-workspace-body">
        <aside aria-label="Broadcast editor modes" className="broadcast-workspace-rail">
          <Link aria-label="Broadcast desk" href="/app/broadcasts">
            <FileText aria-hidden="true" strokeWidth={1.7} />
          </Link>
          <button
            aria-current={focused === "envelope" ? "page" : undefined}
            aria-label="Envelope window"
            onClick={() => focusWindow("envelope")}
            type="button"
          >
            <Pencil aria-hidden="true" strokeWidth={1.7} />
          </button>
          <button
            aria-current={focused === "source" ? "page" : undefined}
            aria-label="HTML source window"
            onClick={() => focusWindow("source")}
            type="button"
          >
            <Code2 aria-hidden="true" strokeWidth={1.7} />
          </button>
          <button
            aria-current={focused === "preview" ? "page" : undefined}
            aria-label="HTML output window"
            onClick={() => focusWindow("preview")}
            type="button"
          >
            <Send aria-hidden="true" strokeWidth={1.7} />
          </button>
        </aside>

        <div className="broadcast-workspace-desk" ref={deskRef}>
          <WorkspaceWindow
            bounds={bounds}
            label="Envelope"
            onChange={(rect) =>
              setRects((current) => ({ ...current, envelope: rect }))
            }
            onFocus={() => focusWindow("envelope")}
            rect={rects.envelope}
            title="Dispatch"
            tone="envelope"
            zIndex={10 + zOrder.indexOf("envelope")}
          >
            <div className="broadcast-render-summary">
              {canEdit ? (
                <div className="broadcast-locked-note">
                  <Pencil aria-hidden="true" strokeWidth={1.8} />
                  <div>
                    <strong>Scheduled dispatch</strong>
                    <p>Edit envelope and HTML before this letter leaves {scheduledLabel}.</p>
                  </div>
                </div>
              ) : null}

              {error ? (
                <p className="form-error broadcast-edit-message" role="alert">
                  {error === "invalid-schedule"
                    ? "Type one unambiguous future date and time."
                    : "Broadcast changes could not be saved."}
                </p>
              ) : null}
              {success === "updated" ? (
                <p className="form-success broadcast-edit-message" role="status">
                  Scheduled broadcast updated.
                </p>
              ) : null}

              {canEdit ? (
                <>
                  <form action={updateBroadcastAction} className="broadcast-edit-form">
                    <input name="broadcastId" type="hidden" value={broadcastId} />
                    <input name="html" type="hidden" value={htmlValue} />
                    <div className="field">
                      <label htmlFor="broadcast-edit-from">From</label>
                      <input
                        autoCapitalize="none"
                        id="broadcast-edit-from"
                        inputMode="email"
                        name="from"
                        onChange={(event) => setFromValue(event.currentTarget.value)}
                        required
                        spellCheck={false}
                        value={fromValue}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="broadcast-edit-audience">Audience</label>
                      <select
                        defaultValue={sourceAudienceId ?? ""}
                        id="broadcast-edit-audience"
                        name="audienceId"
                        required
                      >
                        {audiences.map((audience) => (
                          <option key={audience.id} value={audience.id}>
                            {audience.name} · {audience.activeContactCount} active
                          </option>
                        ))}
                      </select>
                    </div>
                    <NaturalLanguageScheduleField
                      defaultValue={scheduleInput}
                      inputId="broadcast-edit-schedule"
                      referenceTime={referenceTime}
                      timeZone={timeZone}
                    />
                    <div className="field broadcast-edit-subject">
                      <label htmlFor="broadcast-edit-subject">Subject</label>
                      <input
                        id="broadcast-edit-subject"
                        maxLength={998}
                        name="subject"
                        onChange={(event) => setSubjectValue(event.currentTarget.value)}
                        required
                        value={subjectValue}
                      />
                    </div>
                    <div className="broadcast-edit-footer">
                      <p>Signed unsubscribe link stays attached.</p>
                      <button className="btn btn-primary btn-compact" type="submit">
                        Save changes
                      </button>
                    </div>
                  </form>
                  {canCancel ? (
                    <form action={cancelBroadcastAction} className="broadcast-preview-cancel">
                      <input name="broadcastId" type="hidden" value={broadcastId} />
                      <button className="btn btn-danger btn-compact" type="submit">
                        Cancel broadcast
                      </button>
                    </form>
                  ) : null}
                </>
              ) : (
                <>
                  <dl className="broadcast-envelope-details">
                    <div><dt>From</dt><dd>{from}</dd></div>
                    <div><dt>Audience</dt><dd><span>{audienceName}</span></dd></div>
                    <div><dt>Opt-out</dt><dd className="broadcast-envelope-muted">Signed unsubscribe link included</dd></div>
                    <div><dt>When</dt><dd>{scheduledLabel}</dd></div>
                    <div><dt>Subject</dt><dd>{subject}</dd></div>
                  </dl>
                  {canCancel ? (
                    <form action={cancelBroadcastAction} className="broadcast-preview-cancel">
                      <input name="broadcastId" type="hidden" value={broadcastId} />
                      <button className="btn btn-danger btn-compact" type="submit">
                        Cancel broadcast
                      </button>
                    </form>
                  ) : null}
                </>
              )}
            </div>
          </WorkspaceWindow>

          <WorkspaceWindow
            actions={<CopyBroadcastHtml html={source} />}
            bounds={bounds}
            label={canEdit ? "HTML" : "HTML source"}
            onChange={(rect) =>
              setRects((current) => ({ ...current, source: rect }))
            }
            onFocus={() => focusWindow("source")}
            rect={rects.source}
            title="Letter source"
            tone="source"
            zIndex={10 + zOrder.indexOf("source")}
          >
            {canEdit ? (
              <textarea
                aria-label="Broadcast HTML"
                className="broadcast-html-editor"
                id="broadcast-edit-html"
                maxLength={2 * 1024 * 1024}
                onChange={(event) => setHtmlValue(event.currentTarget.value)}
                spellCheck={false}
                value={htmlValue}
              />
            ) : (
              <pre aria-label="Broadcast HTML source" className="broadcast-source-code">
                {sourceLines.map((line, index) => (
                  <span className="broadcast-source-line" key={`${index}-${line.slice(0, 24)}`}>
                    <span aria-hidden="true" className="broadcast-source-number">{index + 1}</span>
                    <code>{line || " "}</code>
                  </span>
                ))}
              </pre>
            )}
          </WorkspaceWindow>

          <WorkspaceWindow
            bounds={bounds}
            label="HTML output"
            onChange={(rect) =>
              setRects((current) => ({ ...current, preview: rect }))
            }
            onFocus={() => focusWindow("preview")}
            rect={rects.preview}
            title="Browser preview"
            tone="preview"
            zIndex={10 + zOrder.indexOf("preview")}
          >
            <div className="broadcast-render-frame">
              {htmlValue.trim() ? (
                <SandboxedHtmlPreview
                  html={previewDocument}
                  title="Rendered broadcast HTML output"
                />
              ) : (
                <div className="broadcast-render-empty">
                  <Send aria-hidden="true" strokeWidth={1.5} />
                  <p>No HTML body in this broadcast.</p>
                </div>
              )}
            </div>
          </WorkspaceWindow>
        </div>
      </div>
    </section>
  );
}
