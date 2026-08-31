import Link from "next/link";
import {
  createAudienceAction,
  createContactAction,
  deleteAudienceAction,
  deleteContactAction,
  deleteUnsubscribedContactsAction,
  importContactsAction,
  updateAudienceAction,
  updateContactAction,
} from "./actions";
import {
  AudienceError,
  MAX_AUDIENCE_SEARCH_LENGTH,
  parseAudienceSearch,
} from "@/lib/audience-core";
import { getAudience, listAudiences, listContacts } from "@/lib/audiences";
import { can } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

type Props = {
  searchParams: Promise<{
    audience?: string;
    audienceQuery?: string;
    contactQuery?: string;
    created?: string;
    deleted?: string;
    error?: string;
    saved?: string;
    unchanged?: string;
    updated?: string;
  }>;
};

function count(value: string | undefined) {
  return value && /^\d+$/.test(value) ? Number(value) : 0;
}

function audiencesHref(params: {
  audience?: string;
  audienceQuery?: string | null;
  contactQuery?: string | null;
}): string {
  const search = new URLSearchParams();
  if (params.audience) search.set("audience", params.audience);
  if (params.audienceQuery) search.set("audienceQuery", params.audienceQuery);
  if (params.contactQuery) search.set("contactQuery", params.contactQuery);
  const query = search.toString();
  return query ? `/app/audiences?${query}` : "/app/audiences";
}

/**
 * Resolves an explicitly selected audience that the sidebar search has filtered
 * out of view. Without this the `records[0]` fallback below would silently swap
 * the contact table over to a different audience's rows.
 */
async function selectedOutsideSearch(input: {
  actorUserId: string;
  audienceId: string;
  orgId: string;
}) {
  try {
    return await getAudience(input);
  } catch (error) {
    if (error instanceof AudienceError) return null;
    throw error;
  }
}

export default async function AudiencesPage({ searchParams }: Props) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canRead = can(organization.role, "audiences.read");
  const canManage = can(organization.role, "audiences.manage");
  const audienceQuery = parseAudienceSearch(status.audienceQuery);
  const contactQuery = parseAudienceSearch(status.contactQuery);
  const records = canRead
    ? await listAudiences({
        actorUserId: session.user.id,
        orgId: organization.id,
        search: audienceQuery,
      })
    : [];
  const matched = records.find((record) => record.id === status.audience) ?? null;
  const selected =
    matched
    ?? (canRead && status.audience && audienceQuery
      ? await selectedOutsideSearch({
          actorUserId: session.user.id,
          audienceId: status.audience,
          orgId: organization.id,
        })
      : null)
    ?? records[0]
    ?? null;
  const contacts = selected
    ? await listContacts({
        actorUserId: session.user.id,
        audienceId: selected.id,
        orgId: organization.id,
        search: contactQuery,
      })
    : [];
  // Counted from the audience itself, never from the filtered rows above: this
  // number labels the bulk delete, which always removes every unsubscribed
  // contact in the audience regardless of any search.
  const unsubscribedCount = selected
    ? selected.contactCount - selected.activeContactCount
    : 0;
  const saved =
    status.saved === "audience-created" ? "Audience created."
      : status.saved === "audience-updated" ? "Audience updated."
        : status.saved === "audience-deleted" ? "Audience and its contacts deleted."
          : status.saved === "contact-created" ? "Contact added."
            : status.saved === "contact-updated" ? "Contact updated."
              : status.saved === "contact-deleted" ? "Contact deleted."
                : status.saved === "unsubscribed-deleted"
                  ? `${count(status.deleted)} unsubscribed contact${count(status.deleted) === 1 ? "" : "s"} deleted.`
                  : status.saved === "contacts-imported"
                    ? `CSV imported: ${count(status.created)} created, ${count(status.updated)} updated, ${count(status.unchanged)} unchanged.`
                    : null;

  return (
    <section className="dashboard-wide">
      <h1 className="page-title">Audiences</h1>
      <p className="page-sub">
        Permission-based contacts for {organization.name}. Broadcasts snapshot
        an audience by ID. Times use <code>{session.user.timezone}</code>.
      </p>
      {saved ? <p className="form-success" role="status">{saved}</p> : null}
      {status.error ? <p className="form-error" role="alert">{status.error}</p> : null}

      <div className="card">
        <h2>Create audience</h2>
        {canManage ? (
          <form action={createAudienceAction} className="audience-create-form">
            <div className="field">
              <label htmlFor="audience-name">Name</label>
              <input id="audience-name" maxLength={120} name="name" placeholder="Weekly readers" required type="text" />
            </div>
            <button className="btn btn-primary" type="submit">Create audience</button>
          </form>
        ) : <p>Owners and admins manage audiences.</p>}
      </div>

      {!canRead ? <p className="empty-state">Your role cannot read audiences.</p> : (
        <div className="audience-layout">
          <aside className="card audience-picker">
            <h2>Audience list</h2>
            <form className="audience-search-form" method="get">
              <div className="field">
                <label htmlFor="audience-query">Search audiences</label>
                <input
                  defaultValue={audienceQuery ?? ""}
                  id="audience-query"
                  maxLength={MAX_AUDIENCE_SEARCH_LENGTH}
                  name="audienceQuery"
                  placeholder="Weekly"
                  type="search"
                />
              </div>
              {status.audience ? (
                <input name="audience" type="hidden" value={status.audience} />
              ) : null}
              {contactQuery ? (
                <input name="contactQuery" type="hidden" value={contactQuery} />
              ) : null}
              <div className="audience-search-actions">
                <button className="btn btn-compact" type="submit">Search</button>
                {audienceQuery ? (
                  <Link
                    className="btn btn-compact"
                    href={audiencesHref({ audience: status.audience, contactQuery })}
                  >
                    Clear
                  </Link>
                ) : null}
              </div>
            </form>
            {records.length === 0 ? (
              <p>{audienceQuery ? "No audiences match that search." : "No audiences yet."}</p>
            ) : (
              <ul>
                {records.map((record) => (
                  <li key={record.id}>
                    <Link
                      aria-current={selected?.id === record.id ? "page" : undefined}
                      href={audiencesHref({ audience: record.id, audienceQuery })}
                    >
                      <strong>{record.name}</strong>
                      <span>{record.activeContactCount} active · {record.contactCount} total</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div>
            {selected ? (
              <>
                <div className="card">
                  <div className="audience-heading">
                    <div>
                      <h2>{selected.name}</h2>
                      <p className="template-meta">
                        ID <code>{selected.id}</code> · updated {formatDateTime(selected.updatedAt, session.user.timezone)}
                      </p>
                    </div>
                    <span className="pill pill-muted">{selected.activeContactCount} active</span>
                  </div>
                  {canManage ? (
                    <>
                      <form action={updateAudienceAction} className="audience-update-form">
                        <input name="audienceId" type="hidden" value={selected.id} />
                        <div className="field">
                          <label htmlFor="selected-audience-name">Audience name</label>
                          <input defaultValue={selected.name} id="selected-audience-name" maxLength={120} name="name" required />
                        </div>
                        <button className="btn btn-compact" type="submit">Save name</button>
                      </form>
                      <form action={deleteAudienceAction} className="audience-delete-form">
                        <input name="audienceId" type="hidden" value={selected.id} />
                        <label className="confirmation-control"><input name="confirm" required type="checkbox" value="yes" /> Delete this audience and all contacts</label>
                        <button className="btn btn-danger btn-compact" type="submit">Delete audience</button>
                      </form>
                    </>
                  ) : null}
                </div>

                {canManage ? (
                  <div className="card">
                    <h2>Add contact</h2>
                    <form action={createContactAction} className="contact-create-form">
                      <input name="audienceId" type="hidden" value={selected.id} />
                      <div className="field">
                        <label htmlFor="contact-email">Email</label>
                        <input id="contact-email" maxLength={254} name="email" required type="email" />
                      </div>
                      <div className="field">
                        <label htmlFor="contact-name">Name</label>
                        <input id="contact-name" maxLength={200} name="name" />
                      </div>
                      <button className="btn btn-primary" type="submit">Add contact</button>
                    </form>
                  </div>
                ) : null}

                {canManage ? (
                  <div className="card">
                    <h2>Import contacts</h2>
                    <form action={importContactsAction} className="contact-import-form">
                      <input name="audienceId" type="hidden" value={selected.id} />
                      <div className="field">
                        <label htmlFor="contact-csv">CSV file</label>
                        <input accept=".csv,text/csv" id="contact-csv" name="csv" required type="file" />
                        <p className="field-help">
                          UTF-8, at most 1 MiB per import. Header: <code>email</code> with optional <code>name</code>. PaperBoy has no audience or contact-count cap. Import only recipients who gave permission; PaperBoy has no purchased-list marketplace.
                        </p>
                      </div>
                      <button className="btn" type="submit">Import contacts</button>
                    </form>
                  </div>
                ) : null}

                <div className="card">
                  <div className="audience-contacts-heading">
                    <div>
                      <h2>Contacts</h2>
                      <p>
                        {contactQuery
                          ? `${contacts.length} of ${selected.contactCount} shown · ${unsubscribedCount} unsubscribed in this audience`
                          : `${unsubscribedCount} unsubscribed`}
                      </p>
                    </div>
                    {canManage && unsubscribedCount > 0 ? (
                      <form action={deleteUnsubscribedContactsAction} className="audience-bulk-delete-form">
                        <input name="audienceId" type="hidden" value={selected.id} />
                        {contactQuery ? (
                          <input name="contactQuery" type="hidden" value={contactQuery} />
                        ) : null}
                        <label className="confirmation-control">
                          <input
                            disabled={Boolean(contactQuery)}
                            name="confirm"
                            required
                            type="checkbox"
                            value="yes"
                          />
                          Confirm removal
                        </label>
                        <button
                          aria-describedby="audience-bulk-delete-note"
                          className="btn btn-danger btn-compact"
                          disabled={Boolean(contactQuery)}
                          type="submit"
                        >
                          Delete all {unsubscribedCount} unsubscribed
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {canManage && unsubscribedCount > 0 ? (
                    <p className="audience-bulk-delete-note" id="audience-bulk-delete-note">
                      Removes every unsubscribed contact row in this audience, never only the rows shown. Organization suppression records remain, so those addresses stay opted out.
                      {contactQuery
                        ? " Unavailable while a contact search is active; clear the search to delete."
                        : null}
                    </p>
                  ) : null}

                  <form className="contact-search-form" method="get">
                    <input name="audience" type="hidden" value={selected.id} />
                    {audienceQuery ? (
                      <input name="audienceQuery" type="hidden" value={audienceQuery} />
                    ) : null}
                    <div className="field">
                      <label htmlFor="contact-query">Search contacts</label>
                      <input
                        defaultValue={contactQuery ?? ""}
                        id="contact-query"
                        maxLength={MAX_AUDIENCE_SEARCH_LENGTH}
                        name="contactQuery"
                        placeholder="Email or name"
                        type="search"
                      />
                    </div>
                    <div className="contact-search-actions">
                      <button className="btn btn-compact" type="submit">Search</button>
                      {contactQuery ? (
                        <Link
                          className="btn btn-compact"
                          href={audiencesHref({ audience: selected.id, audienceQuery })}
                        >
                          Clear
                        </Link>
                      ) : null}
                    </div>
                  </form>
                  <div className="table-scroll">
                    <table className="table contact-table">
                      <thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Updated</th>{canManage ? <th>Manage</th> : null}</tr></thead>
                      <tbody>
                        {contacts.length === 0 ? (
                          <tr><td colSpan={canManage ? 5 : 4}>{contactQuery ? "No contacts match that search." : "No contacts in this audience."}</td></tr>
                        ) : contacts.map((contact) => (
                          <tr key={contact.id}>
                            <td>{canManage ? <input aria-label={`Email for ${contact.email}`} defaultValue={contact.email} form={`contact-${contact.id}`} maxLength={254} name="email" required type="email" /> : contact.email}</td>
                            <td>{canManage ? <input aria-label={`Name for ${contact.email}`} defaultValue={contact.name ?? ""} form={`contact-${contact.id}`} maxLength={200} name="name" /> : contact.name ?? "—"}</td>
                            <td>
                              {contact.unsubscribedAt ? (
                                <><span className="pill pill-muted">Unsubscribed</span><span className="contact-status-time">{formatDateTime(contact.unsubscribedAt, session.user.timezone)}</span></>
                              ) : <span className="pill pill-accent">Active</span>}
                            </td>
                            <td>{formatDateTime(contact.updatedAt, session.user.timezone)}</td>
                            {canManage ? (
                              <td>
                                <div className="table-manage-actions">
                                  <form action={updateContactAction} id={`contact-${contact.id}`}>
                                    <input name="audienceId" type="hidden" value={selected.id} />
                                    <input name="contactId" type="hidden" value={contact.id} />
                                    <button className="btn btn-compact" type="submit">Save</button>
                                  </form>
                                  <form action={deleteContactAction} className="contact-delete-form">
                                    <input name="audienceId" type="hidden" value={selected.id} />
                                    <input name="contactId" type="hidden" value={contact.id} />
                                    <label className="confirmation-control"><input name="confirm" required type="checkbox" value="yes" /> Confirm removal</label>
                                    <button className="btn btn-danger btn-compact" type="submit">Remove</button>
                                  </form>
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="card audience-empty-notice">
                <p className="empty-state-kicker">Return to sender</p>
                <h2>No audiences yet</h2>
                <p>Create an audience above, then add or import permission-based contacts.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
