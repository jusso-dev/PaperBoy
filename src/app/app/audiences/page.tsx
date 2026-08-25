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
import { listAudiences, listContacts } from "@/lib/audiences";
import { can } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

type Props = {
  searchParams: Promise<{
    audience?: string;
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

export default async function AudiencesPage({ searchParams }: Props) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canRead = can(organization.role, "audiences.read");
  const canManage = can(organization.role, "audiences.manage");
  const records = canRead
    ? await listAudiences({ actorUserId: session.user.id, orgId: organization.id })
    : [];
  const selected = records.find((record) => record.id === status.audience) ?? records[0] ?? null;
  const contacts = selected
    ? await listContacts({
        actorUserId: session.user.id,
        audienceId: selected.id,
        orgId: organization.id,
      })
    : [];
  const unsubscribedCount = contacts.filter((contact) => contact.unsubscribedAt).length;
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
    <section>
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
            {records.length === 0 ? <p>No audiences yet.</p> : (
              <ul>
                {records.map((record) => (
                  <li key={record.id}>
                    <Link
                      aria-current={selected?.id === record.id ? "page" : undefined}
                      href={`/app/audiences?audience=${record.id}`}
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
                      <p>{unsubscribedCount} unsubscribed</p>
                    </div>
                    {canManage && unsubscribedCount > 0 ? (
                      <form action={deleteUnsubscribedContactsAction} className="audience-bulk-delete-form">
                        <input name="audienceId" type="hidden" value={selected.id} />
                        <label className="confirmation-control">
                          <input name="confirm" required type="checkbox" value="yes" />
                          Confirm removal
                        </label>
                        <button className="btn btn-danger btn-compact" type="submit">
                          Delete all unsubscribed
                        </button>
                      </form>
                    ) : null}
                  </div>
                  {canManage && unsubscribedCount > 0 ? (
                    <p className="audience-bulk-delete-note">
                      Removes unsubscribed contact rows from this audience. Organization suppression records remain, so those addresses stay opted out.
                    </p>
                  ) : null}
                  <div className="table-scroll">
                    <table className="table contact-table">
                      <thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Updated</th>{canManage ? <th>Manage</th> : null}</tr></thead>
                      <tbody>
                        {contacts.length === 0 ? (
                          <tr><td colSpan={canManage ? 5 : 4}>No contacts in this audience.</td></tr>
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
