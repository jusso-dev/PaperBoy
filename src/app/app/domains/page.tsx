import {
  createDomainAction,
  deleteDomainAction,
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
  created: "Domain added. Publish the required DNS records below.",
  deleted: "Domain deleted.",
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
                    Ownership and SPF are required for verification. DMARC is
                    recommended. DKIM becomes required when signing lands in
                    the next setup step. The starter SPF policy assumes your
                    outbound host is authorised by this domain&apos;s MX records.
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
                        const check = domain.dnsChecks[record.key];

                        return (
                          <tr key={record.key}>
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
                                    ? "Next setup step"
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
