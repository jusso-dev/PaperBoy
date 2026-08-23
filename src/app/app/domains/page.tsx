import {
  createDomainAction,
  deleteDomainAction,
  finalizeDkimRotationAction,
  rotateDkimAction,
  setupDkimAction,
  verifyDomainAction,
} from "./actions";
import { can } from "@/lib/authorization";
import { domainDnsRecords, listDomains } from "@/lib/domains";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

type DomainsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

const savedMessages: Record<string, string> = {
  checked:
    "DNS check finished. Publish every required record, wait for propagation, then check again.",
  created: "Domain and its first DKIM selector are ready. Publish the required DNS records below.",
  deleted: "Domain deleted.",
  "dkim-ready": "A DKIM selector is ready to publish.",
  "rotation-finalised":
    "DKIM rotation finalised. The retired private key has been destroyed.",
  "rotation-started":
    "A new DKIM selector is ready. Publish it, then check DNS to switch without downtime.",
  verified: "Required DNS records matched. Live sending is now allowed for this domain.",
};

const checkLabels = {
  error: "Resolver error",
  matched: "Matched",
  missing: "Not found",
  pending: "Pending setup",
  unchecked: "Not checked",
} as const;

export default async function DomainsPage({ searchParams }: DomainsPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canCreate = can(organization.role, "domains.create");
  const canDelete = can(organization.role, "domains.delete");
  const canManageDkim = can(organization.role, "domains.manageDkim");
  const canRead = can(organization.role, "domains.read");
  const canVerify = can(organization.role, "domains.verify");
  const sendingDomains = canRead
    ? await listDomains({
        actorUserId: session.user.id,
        orgId: organization.id,
      })
    : [];

  return (
    <section>
      <h1 className="page-title">Sending domains</h1>
      <p className="page-sub">
        DNS and live-send readiness for {organization.name}. Times use{" "}
        <code>{session.user.timezone}</code>.
      </p>

      {status.saved && savedMessages[status.saved] ? (
        <p className="form-success" role="status">
          {savedMessages[status.saved]}
        </p>
      ) : null}
      {status.error ? (
        <p className="form-error" role="alert">
          {status.error}
        </p>
      ) : null}

      <div className="card">
        <h2>Add a sending domain</h2>
        {canCreate ? (
          <>
            <p>
              Add a hostname you control. PaperBoy never buys or changes DNS
              for you.
            </p>
            <form action={createDomainAction} className="domain-form">
              <div className="field">
                <label htmlFor="domain-name">Domain</label>
                <input
                  autoCapitalize="none"
                  autoComplete="off"
                  id="domain-name"
                  maxLength={253}
                  name="name"
                  placeholder="mail.example.com"
                  required
                  spellCheck={false}
                  type="text"
                />
              </div>
              <button className="btn btn-primary" type="submit">
                Add domain
              </button>
            </form>
          </>
        ) : (
          <p>Owners and admins add sending domains.</p>
        )}
      </div>

      {!canRead ? (
        <div className="card">
          <h2>Domains</h2>
          <p>Your role cannot read domain configuration.</p>
        </div>
      ) : sendingDomains.length === 0 ? (
        <div className="card">
          <h2>No domains yet</h2>
          <p>Add the first hostname to get its DNS instructions.</p>
        </div>
      ) : (
        <div className="domain-list">
          {sendingDomains.map((domain) => {
            const records = domainDnsRecords(domain);
            const verified = domain.status === "verified";
            const activeKey = domain.dkimKeys.find(
              (key) => key.status === "active",
            );
            const pendingKey = domain.dkimKeys.find(
              (key) => key.status === "pending",
            );
            const retiringKey = domain.dkimKeys.find(
              (key) => key.status === "retiring",
            );
            const configuredKeys = domain.dkimKeys.filter(
              (key) => key.status !== "retired",
            );

            return (
              <article className="card domain-card" key={domain.id}>
                <div className="domain-heading">
                  <div>
                    <p className="domain-name">{domain.name}</p>
                    <p className="domain-meta">
                      Added {formatDateTime(domain.createdAt, session.user.timezone)}
                      {domain.lastCheckedAt
                        ? ` · checked ${formatDateTime(
                            domain.lastCheckedAt,
                            session.user.timezone,
                          )}`
                        : " · not checked yet"}
                    </p>
                  </div>
                  <span className={`pill ${verified ? "pill-accent" : "pill-muted"}`}>
                    {verified ? "Verified" : "Pending"}
                  </span>
                </div>

                <div className="domain-explainer">
                  <p>
                    Ownership, SPF, and the active DKIM selector are required.
                    DMARC is recommended. The starter SPF policy assumes your
                    outbound host is authorised by this domain&apos;s MX records.
                    When Cloudflare Email Routing uses this same hostname,
                    merge <code>include:_spf.mx.cloudflare.net</code> into this
                    one SPF record. Different owner names keep one SPF record
                    each. PaperBoy&apos;s <code>pb…</code> selectors coexist with
                    Cloudflare&apos;s provider-managed selectors.
                  </p>
                  {domain.verifiedAt ? (
                    <p>
                      Verified {formatDateTime(domain.verifiedAt, session.user.timezone)}.
                    </p>
                  ) : null}
                </div>

                <div className="table-scroll">
                  <table className="table dns-record-table">
                    <caption>Records to publish for {domain.name}</caption>
                    <thead>
                      <tr>
                        <th>Purpose</th>
                        <th>Type</th>
                        <th>Host</th>
                        <th>Value</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => {
                        const check =
                          record.status ?? domain.dnsChecks[record.key];

                        return (
                          <tr key={record.name}>
                            <td>
                              <strong>{record.key.toUpperCase()}</strong>
                              <br />
                              <span className="dns-description">
                                {record.description}
                              </span>
                              <br />
                              <span className="dns-requirement">
                                {record.required
                                  ? "Required"
                                  : record.key === "dkim" && !record.value
                                    ? "Setup required"
                                    : record.key === "dkim" &&
                                        record.lifecycle === "retiring"
                                      ? "Keep during rotation"
                                      : record.key === "dkim"
                                        ? "Rotation candidate"
                                        : "Recommended"}
                              </span>
                            </td>
                            <td>{record.type}</td>
                            <td>
                              <code>{record.name}</code>
                            </td>
                            <td>
                              {record.value ? (
                                <code>{record.value}</code>
                              ) : (
                                <span className="dns-pending-value">
                                  Generated during DKIM setup
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`dns-check dns-check-${check}`}
                              >
                                {checkLabels[check]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="domain-explainer">
                  <p>
                    <strong>DKIM key lifecycle</strong>
                  </p>
                  {domain.dkimKeys.length === 0 ? (
                    <p>No signing key exists yet.</p>
                  ) : (
                    <ul>
                      {domain.dkimKeys.map((key) => (
                        <li key={key.id}>
                          <code>{key.selector}</code> — {key.status}; created{" "}
                          {formatDateTime(key.createdAt, session.user.timezone)}
                          {key.activatedAt ? (
                            <>
                              ; activated{" "}
                              {formatDateTime(
                                key.activatedAt,
                                session.user.timezone,
                              )}
                            </>
                          ) : null}
                          {key.retiredAt ? (
                            <>
                              ; retired{" "}
                              {formatDateTime(
                                key.retiredAt,
                                session.user.timezone,
                              )}
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p>
                    Private keys are encrypted at rest and are never shown in
                    the console, API, or MCP output. Cloudflare Email Sending
                    uses Cloudflare-managed DKIM instead; PaperBoy does not add
                    its signature to that provider path.
                  </p>
                </div>

                <div className="domain-actions">
                  {canVerify ? (
                    <form action={verifyDomainAction}>
                      <input name="domainId" type="hidden" value={domain.id} />
                      <button className="btn btn-primary" type="submit">
                        Check DNS now
                      </button>
                    </form>
                  ) : (
                    <p>Owners and admins run DNS checks.</p>
                  )}

                  {canManageDkim && configuredKeys.length === 0 ? (
                    <form action={setupDkimAction}>
                      <input name="domainId" type="hidden" value={domain.id} />
                      <button className="btn" type="submit">
                        Generate DKIM key
                      </button>
                    </form>
                  ) : null}

                  {canManageDkim && activeKey && !pendingKey && !retiringKey ? (
                    <form action={rotateDkimAction}>
                      <input name="domainId" type="hidden" value={domain.id} />
                      <button className="btn" type="submit">
                        Start DKIM rotation
                      </button>
                    </form>
                  ) : null}

                  {canManageDkim && activeKey && retiringKey && !pendingKey ? (
                    <details className="domain-delete">
                      <summary>Finalise DKIM rotation</summary>
                      <p>
                        Confirm only after receivers can resolve the active
                        selector. PaperBoy destroys the retired private key.
                      </p>
                      <form action={finalizeDkimRotationAction}>
                        <input name="domainId" type="hidden" value={domain.id} />
                        <button className="btn btn-danger" type="submit">
                          Confirm finalise
                        </button>
                      </form>
                    </details>
                  ) : null}

                  {canDelete ? (
                    <details className="domain-delete">
                      <summary>Delete domain</summary>
                      <p>
                        This removes the configuration. Existing message
                        history keeps no domain link.
                      </p>
                      <form action={deleteDomainAction}>
                        <input name="domainId" type="hidden" value={domain.id} />
                        <button className="btn btn-danger" type="submit">
                          Confirm delete
                        </button>
                      </form>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
