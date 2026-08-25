import Link from "next/link";
import {
  ArrowLeft,
  Code2,
  FileText,
  Mail,
  Pencil,
  Send,
} from "lucide-react";
import { CopyBroadcastHtml } from "@/components/broadcasts/copy-broadcast-html";
import { NaturalLanguageScheduleField } from "@/components/broadcasts/natural-language-schedule-field";
import {
  cancelBroadcastAction,
  updateBroadcastAction,
} from "@/app/app/broadcasts/actions";
import { templateBrowserPreviewDocument } from "@/lib/template-browser-preview";

type BroadcastPreviewWorkspaceProps = {
  audienceName: string;
  audiences: Array<{ activeContactCount: number; id: string; name: string }>;
  broadcastId: string;
  canCancel: boolean;
  canEdit: boolean;
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
  timeZone: string;
  userInitial: string;
};

export function BroadcastPreviewWorkspace({
  audienceName,
  audiences,
  broadcastId,
  canCancel,
  canEdit,
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
  timeZone,
  userInitial,
}: BroadcastPreviewWorkspaceProps) {
  const source = html ?? "<!-- This broadcast has no HTML body. -->";
  const sourceLines = source.split("\n");

  return (
    <section className="broadcast-workspace">
      <header className="broadcast-workspace-header">
        <Link aria-label="Back to broadcasts" className="broadcast-workspace-back" href="/app/broadcasts">
          <ArrowLeft aria-hidden="true" strokeWidth={1.8} />
        </Link>
        <div className="broadcast-workspace-title">
          <Mail aria-hidden="true" strokeWidth={1.7} />
          <Link className="broadcast-workspace-brand" href="/app">PaperBoy</Link>
          <span aria-hidden="true">/</span>
          <Link href="/app/broadcasts">Broadcasts</Link>
          <span aria-hidden="true">/</span>
          <strong title={name}>{name}</strong>
          <span className="broadcast-workspace-status" data-status={status}>{status}</span>
        </div>
        <div className="broadcast-workspace-actions">
          <span aria-hidden="true" className="broadcast-workspace-avatar">
            {userInitial}
          </span>
          <Link className="broadcast-workspace-test" href="/app/send">
            Test email
          </Link>
        </div>
      </header>

      <div className="broadcast-workspace-body">
        <aside aria-label="Broadcast editor modes" className="broadcast-workspace-rail">
          <Link aria-label="Broadcast desk" href="/app/broadcasts">
            <FileText aria-hidden="true" strokeWidth={1.7} />
          </Link>
          <button aria-label="Visual editor unavailable for frozen broadcast" disabled type="button">
            <Pencil aria-hidden="true" strokeWidth={1.7} />
          </button>
          <button aria-current="page" aria-label="HTML code" type="button">
            <Code2 aria-hidden="true" strokeWidth={1.7} />
          </button>
        </aside>

        <section className="broadcast-source-panel">
          <div className="broadcast-source-heading">
            <div>
              <span>Letter source</span>
              <h1>Frozen HTML</h1>
            </div>
            <CopyBroadcastHtml html={source} />
          </div>
          <pre aria-label="Frozen broadcast HTML source" className="broadcast-source-code">
            {sourceLines.map((line, index) => (
              <span className="broadcast-source-line" key={`${index}-${line.slice(0, 24)}`}>
                <span aria-hidden="true" className="broadcast-source-number">{index + 1}</span>
                <code>{line || " "}</code>
              </span>
            ))}
          </pre>
        </section>

        <section className="broadcast-render-panel">
          <div className="broadcast-render-summary">
            {canEdit ? (
              <div className="broadcast-locked-note">
                <Pencil aria-hidden="true" strokeWidth={1.8} />
                <div>
                  <strong>Scheduled dispatch</strong>
                  <p>Edit envelope details before this letter leaves {scheduledLabel}.</p>
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
                  <div className="field">
                    <label htmlFor="broadcast-edit-from">From</label>
                    <input
                      autoCapitalize="none"
                      defaultValue={from}
                      id="broadcast-edit-from"
                      inputMode="email"
                      name="from"
                      required
                      spellCheck={false}
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
                      defaultValue={subject}
                      id="broadcast-edit-subject"
                      maxLength={998}
                      name="subject"
                      required
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

          <div className="broadcast-render-frame">
            {html ? (
              <iframe
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={templateBrowserPreviewDocument(html)}
                title="Rendered broadcast email"
              />
            ) : (
              <div className="broadcast-render-empty">
                <Send aria-hidden="true" strokeWidth={1.5} />
                <p>No HTML body in this broadcast.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
