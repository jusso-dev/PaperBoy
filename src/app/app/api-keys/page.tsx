import { revokeApiKeyAction } from "./actions";
import { ApiKeyForm } from "./api-key-form";
import { listApiKeys } from "@/lib/api-keys";
import {
  formatApiKeyDisplay,
  isApiKeyEnvironment,
} from "@/lib/api-key-crypto";
import { can } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

type ApiKeysPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function ApiKeysPage({ searchParams }: ApiKeysPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canCreate = can(organization.role, "apiKeys.create");
  const canRead = can(organization.role, "apiKeys.read");
  const canRevoke = can(organization.role, "apiKeys.revoke");
  const keys = canRead
    ? await listApiKeys({
        actorUserId: session.user.id,
        orgId: organization.id,
      })
    : [];

  return (
    <section>
      <h1 className="page-title">API keys</h1>
      <p className="page-sub">
        Bearer credentials for {organization.name}.
      </p>

      {status.saved === "revoked" ? (
        <p className="form-success" role="status">
          API key revoked. Requests using it now receive 401.
        </p>
      ) : null}
      {status.error ? (
        <p className="form-error" role="alert">
          {status.error}
        </p>
      ) : null}

      <div className="card">
        <h2>Create key</h2>
        {canCreate ? (
          <>
            <p>
              Live and test keys are separate. The raw key appears once and is
              never stored by PaperBoy.
            </p>
            <ApiKeyForm />
          </>
        ) : (
          <p>Owners and admins create API keys.</p>
        )}
      </div>

      {canRead ? (
        <div className="card">
          <h2>Keys</h2>
          <div className="table-scroll">
            <table className="table api-key-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  {canRevoke ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 ? (
                  <tr>
                    <td colSpan={canRevoke ? 6 : 5}>No API keys yet.</td>
                  </tr>
                ) : (
                  keys.map((key) => {
                    const environment = isApiKeyEnvironment(key.environment)
                      ? key.environment
                      : "live";
                    const isRevoked = Boolean(key.revokedAt);

                    return (
                      <tr key={key.id}>
                        <td>
                          {key.name}
                          <br />
                          <span className="pill pill-muted">{environment}</span>
                        </td>
                        <td>
                          <code>
                            {formatApiKeyDisplay(environment, key.keyId)}
                          </code>
                        </td>
                        <td>
                          {formatDateTime(key.createdAt, session.user.timezone)}
                        </td>
                        <td>
                          {key.lastUsedAt
                            ? formatDateTime(
                                key.lastUsedAt,
                                session.user.timezone,
                              )
                            : "Never"}
                        </td>
                        <td>
                          <span
                            className={`pill ${
                              isRevoked ? "pill-muted" : "pill-accent"
                            }`}
                          >
                            {isRevoked ? "Revoked" : "Active"}
                          </span>
                        </td>
                        {canRevoke ? (
                          <td>
                            {!isRevoked ? (
                              <form action={revokeApiKeyAction}>
                                <input
                                  name="apiKeyId"
                                  type="hidden"
                                  value={key.id}
                                />
                                <button className="btn btn-compact" type="submit">
                                  Revoke
                                </button>
                              </form>
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <h2>Keys</h2>
          <p>Owners and admins can view API key metadata.</p>
        </div>
      )}
    </section>
  );
}
