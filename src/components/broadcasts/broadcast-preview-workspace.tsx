import Link from "next/link";
import {
  ArrowLeft,
  Code2,
  Info,
  Pencil,
  Radio,
  Send,
} from "lucide-react";
import { CopyBroadcastHtml } from "@/components/broadcasts/copy-broadcast-html";
import { templateBrowserPreviewDocument } from "@/lib/template-browser-preview";

type BroadcastPreviewWorkspaceProps = {
  audienceName: string;
  from: string;
  html: string | null;
  name: string;
  scheduledLabel: string;
  status: string;
  subject: string;
  userInitial: string;
};

export function BroadcastPreviewWorkspace({
  audienceName,
  from,
  html,
  name,
  scheduledLabel,
  status,
  subject,
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
          <Radio aria-hidden="true" strokeWidth={1.8} />
          <Link href="/app/broadcasts">Broadcasts</Link>
          <span aria-hidden="true">/</span>
          <strong title={name}>{name}</strong>
          <span className="broadcast-workspace-status">{status}</span>
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
          <Link aria-label="Broadcast summary" href="/app/broadcasts">
            <ArrowLeft aria-hidden="true" strokeWidth={1.7} />
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
            <h1>HTML code editor</h1>
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
            {status === "scheduled" ? (
              <div className="broadcast-locked-note">
                <Info aria-hidden="true" strokeWidth={1.8} />
                <div>
                  <strong>Editing locked:</strong>
                  <p>This broadcast is scheduled to send {scheduledLabel}.</p>
                  <Link href="/app/broadcasts">Manage schedule</Link>
                </div>
              </div>
            ) : null}

            <dl className="broadcast-envelope-details">
              <div><dt>From</dt><dd>{from}</dd></div>
              <div><dt>Reply-To</dt><dd>{from}</dd></div>
              <div><dt>To</dt><dd><span>{audienceName}</span></dd></div>
              <div><dt>Subscribe to</dt><dd className="broadcast-envelope-muted">Audience unsubscribe</dd></div>
              <div><dt>When</dt><dd>{scheduledLabel}</dd></div>
              <div><dt>Subject</dt><dd>{subject}</dd></div>
            </dl>
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
