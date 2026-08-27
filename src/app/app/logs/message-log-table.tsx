"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { SandboxedHtmlPreview } from "@/components/broadcasts/sandboxed-html-preview";
import type { MessageLogOrder, MessageLogSort } from "@/lib/message-status-core";
import { templateBrowserPreviewDocument } from "@/lib/template-browser-preview";
import {
  getMessageDrawerAction,
  type MessageDrawerResult,
} from "./actions";

export type MessageLogRow = {
  attemptCount: number;
  createdAt: string;
  deliveryMode: string;
  domainName: string;
  environment: string;
  failureReason: string | null;
  id: string;
  lastErrorCode: string | null;
  subject: string;
  to: string[];
  stateLabel: string;
  stateTime: string | null;
  status: "failed" | "queued" | "sending" | "sent";
};

function byteSize(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KiB`;
  return `${(value / 1_048_576).toFixed(1)} MiB`;
}

function SortHeader({
  active,
  children,
  href,
  order,
}: {
  active: boolean;
  children: string;
  href: string;
  order: MessageLogOrder;
}) {
  return (
    <th aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"} scope="col">
      <a className={active ? "message-log-sort is-active" : "message-log-sort"} href={href}>
        {children}
        {active ? (order === "asc" ? " ↑" : " ↓") : ""}
      </a>
    </th>
  );
}

export function MessageLogTable({
  order,
  rows,
  sort,
  sortLinks,
}: {
  order: MessageLogOrder;
  rows: MessageLogRow[];
  sort: MessageLogSort;
  sortLinks: Record<MessageLogSort, string>;
}) {
  const [selected, setSelected] = useState<MessageLogRow | null>(null);
  const [result, setResult] = useState<MessageDrawerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const requestToken = useRef(0);

  const close = useCallback(() => {
    requestToken.current += 1;
    setSelected(null);
    setResult(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selected) return;
    closeButton.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close, selected]);

  async function open(row: MessageLogRow) {
    const token = requestToken.current + 1;
    requestToken.current = token;
    setSelected(row);
    setResult(null);
    setLoading(true);
    const loaded = await getMessageDrawerAction(row.id);
    if (requestToken.current !== token) return;
    setResult(loaded);
    setLoading(false);
  }

  function openFromKeyboard(
    event: KeyboardEvent<HTMLTableRowElement>,
    row: MessageLogRow,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void open(row);
  }

  if (rows.length === 0) {
    return <p className="empty-state">No messages match these filters.</p>;
  }

  return (
    <>
      <div className="table-scroll">
        <table className="table delivery-table message-log-table">
          <caption>
            Matching messages. Select a row to read the subject, body, and event
            timeline without leaving this page. Column headers change sort order.
          </caption>
          <thead>
            <tr>
              <SortHeader
                active={sort === "subject"}
                href={sortLinks.subject}
                order={order}
              >
                Email
              </SortHeader>
              <SortHeader
                active={sort === "status"}
                href={sortLinks.status}
                order={order}
              >
                State
              </SortHeader>
              <th scope="col">Domain</th>
              <SortHeader
                active={sort === "attempts"}
                href={sortLinks.attempts}
                order={order}
              >
                Attempts
              </SortHeader>
              <SortHeader
                active={sort === "created"}
                href={sortLinks.created}
                order={order}
              >
                Queued
              </SortHeader>
              <th scope="col">State time</th>
              <th scope="col">Failure</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                aria-label={`Open ${row.subject || "email"}`}
                className="message-log-row"
                key={row.id}
                onClick={() => void open(row)}
                onKeyDown={(event) => openFromKeyboard(event, row)}
                tabIndex={0}
              >
                <td>
                  <strong className="message-log-subject">
                    {row.subject.trim() || "(no subject)"}
                  </strong>
                  <span className="delivery-meta">
                    {row.to.length > 0 ? `to ${row.to.join(", ")}` : "No recipients"}
                  </span>
                  <span className="delivery-meta">
                    {row.environment} · {row.deliveryMode}
                  </span>
                  <span className="row-open-hint">View email</span>
                </td>
                <td>
                  <span className={`pill delivery-status-${row.status}`}>
                    {row.status}
                  </span>
                </td>
                <td>{row.domainName}</td>
                <td>{row.attemptCount}</td>
                <td>{row.createdAt}</td>
                <td>
                  {row.stateTime ? (
                    <>
                      <span className="delivery-meta">{row.stateLabel}</span>
                      {row.stateTime}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {row.failureReason ? (
                    <>
                      {row.lastErrorCode ? <code>{row.lastErrorCode}</code> : null}
                      <span className="delivery-failure">
                        {row.failureReason}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="message-drawer-backdrop" onMouseDown={close}>
          <aside
            aria-busy={loading}
            aria-labelledby="message-drawer-title"
            aria-modal="true"
            className="message-drawer"
            id="message-event-drawer"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="message-drawer-heading">
              <div>
                <p className="eyebrow">Email</p>
                <h2 id="message-drawer-title">
                  {result?.ok
                    ? result.message.subject.trim() || "(no subject)"
                    : selected.subject.trim() || "Email"}
                </h2>
                <code>{selected.id}</code>
              </div>
              <button
                aria-label="Close email"
                className="btn btn-compact"
                onClick={close}
                ref={closeButton}
                type="button"
              >
                Close
              </button>
            </div>

            {loading ? (
              <p className="empty-state">Loading email…</p>
            ) : result?.ok === false ? (
              <p className="form-error" role="alert">
                {result.error}
              </p>
            ) : result?.ok ? (
              <div className="message-drawer-content">
                <div className="message-drawer-status">
                  <span
                    className={`pill delivery-status-${result.message.status}`}
                  >
                    {result.message.status}
                  </span>
                  <span>
                    {result.message.environment} · {result.message.deliveryMode}
                  </span>
                  <span>Times use {result.timeZone}</span>
                </div>

                <dl className="message-detail-list">
                  <div>
                    <dt>From</dt>
                    <dd>{result.message.from}</dd>
                  </div>
                  <div>
                    <dt>To</dt>
                    <dd>{result.message.to.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Subject</dt>
                    <dd>{result.message.subject.trim() || "(no subject)"}</dd>
                  </div>
                  <div>
                    <dt>Queued</dt>
                    <dd>{result.message.createdAt}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{result.message.updatedAt}</dd>
                  </div>
                  <div>
                    <dt>Attempts</dt>
                    <dd>{result.message.attemptCount}</dd>
                  </div>
                  {result.message.sentAt ? (
                    <div>
                      <dt>Sent</dt>
                      <dd>{result.message.sentAt}</dd>
                    </div>
                  ) : null}
                  {result.message.nextAttemptAt ? (
                    <div>
                      <dt>Next attempt</dt>
                      <dd>{result.message.nextAttemptAt}</dd>
                    </div>
                  ) : null}
                </dl>

                {result.message.failureReason ? (
                  <div className="message-drawer-failure">
                    <strong>Failure</strong>
                    <p>
                      {result.message.lastErrorCode ? (
                        <code>{result.message.lastErrorCode}</code>
                      ) : null}{" "}
                      {result.message.failureReason}
                    </p>
                  </div>
                ) : null}

                <section className="message-drawer-section">
                  <h3>Body</h3>
                  {result.message.html ? (
                    <div className="message-body-preview">
                      <SandboxedHtmlPreview
                        html={templateBrowserPreviewDocument(result.message.html)}
                        title={result.message.subject || "Email body"}
                      />
                    </div>
                  ) : null}
                  {result.message.text && result.message.html ? (
                    <details className="message-body-text-details">
                      <summary>Plain text</summary>
                      <pre className="message-body-text">{result.message.text}</pre>
                    </details>
                  ) : null}
                  {result.message.text && !result.message.html ? (
                    <pre className="message-body-text">{result.message.text}</pre>
                  ) : null}
                  {!result.message.html && !result.message.text ? (
                    <p>This message has no stored body.</p>
                  ) : null}
                </section>

                <section className="message-drawer-section">
                  <h3>Attachments</h3>
                  {result.message.attachments.length === 0 ? (
                    <p>None.</p>
                  ) : (
                    <ul className="message-attachment-list">
                      {result.message.attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <span>{attachment.filename}</span>
                          <small>
                            {attachment.contentType} · {byteSize(attachment.size)}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="message-drawer-section">
                  <h3>Event timeline</h3>
                  {result.events.length === 0 ? (
                    <p>No events recorded.</p>
                  ) : (
                    <ol className="message-event-timeline">
                      {result.events.map((event) => (
                        <li key={event.id}>
                          <span
                            className={`pill message-event-${event.type}`}
                          >
                            {event.type}
                          </span>
                          <time>{event.createdAt}</time>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                {result.canDownloadMime ? (
                  <section className="message-drawer-section mime-download">
                    <h3>Raw MIME</h3>
                    <p>
                      The download is an unsigned reconstruction of stored
                      fields. Provider-owned Cloudflare DKIM and ARC signatures
                      are not stored by PaperBoy.
                    </p>
                    <a
                      className="btn"
                      href={`/app/logs/${result.message.id}/mime`}
                    >
                      Download MIME (.eml)
                    </a>
                  </section>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}
