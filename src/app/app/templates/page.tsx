import {
  createTemplateAction,
  deleteTemplateAction,
  updateTemplateAction,
} from "./actions";
import { can } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import { listTemplates } from "@/lib/templates";

type TemplatesPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

const savedMessages: Record<string, string> = {
  created: "Template created.",
  deleted: "Template deleted.",
  updated: "Template updated.",
};

export default async function TemplatesPage({
  searchParams,
}: TemplatesPageProps) {
  const [{ organization, session }, status] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const canCreate = can(organization.role, "templates.create");
  const canDelete = can(organization.role, "templates.delete");
  const canRead = can(organization.role, "templates.read");
  const canUpdate = can(organization.role, "templates.update");
  const templates = canRead
    ? await listTemplates({
        actorUserId: session.user.id,
        orgId: organization.id,
      })
    : [];

  return (
    <section>
      <h1 className="page-title">Email templates</h1>
      <p className="page-sub">
        Reusable subject, HTML, and plain-text content for {organization.name}.
        Times use <code>{session.user.timezone}</code>.
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

      <div className="card template-guide">
        <h2>Safe variables</h2>
        <p>
          Insert values with <code>{"{{reader.name}}"}</code>. PaperBoy supports
          dotted variables only—no helpers, executable expressions, sections,
          or unescaped triple braces. Values are escaped when inserted into
          HTML. Missing values render as empty text.
        </p>
      </div>

      <div className="card">
        <h2>Create template</h2>
        {canCreate ? (
          <form action={createTemplateAction} className="template-form">
            <div className="template-form-heading">
              <div className="field">
                <label htmlFor="template-name">Name</label>
                <input
                  id="template-name"
                  maxLength={120}
                  name="name"
                  placeholder="Welcome reader"
                  required
                  type="text"
                />
              </div>
              <div className="field">
                <label htmlFor="template-subject">Subject</label>
                <input
                  id="template-subject"
                  maxLength={998}
                  name="subject"
                  placeholder="Welcome, {{reader.name}}"
                  required
                  type="text"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="template-html">HTML</label>
              <textarea
                id="template-html"
                maxLength={2 * 1024 * 1024}
                name="html"
                placeholder="<p>Hello {{reader.name}}</p>"
                rows={7}
              />
            </div>
            <div className="field">
              <label htmlFor="template-text">Plain text</label>
              <textarea
                id="template-text"
                maxLength={2 * 1024 * 1024}
                name="text"
                placeholder="Hello {{reader.name}}"
                rows={5}
              />
              <p className="field-help">Provide HTML, plain text, or both.</p>
            </div>
            <button className="btn btn-primary" type="submit">
              Create template
            </button>
          </form>
        ) : (
          <p>Owners and admins create templates.</p>
        )}
      </div>

      {!canRead ? (
        <div className="card">
          <h2>Templates</h2>
          <p>Your role cannot read templates.</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="card">
          <h2>No templates yet</h2>
          <p>Create the first reusable email above.</p>
        </div>
      ) : (
        <div className="template-list">
          {templates.map((template) => (
            <article className="card template-card" key={template.id}>
              <div className="template-heading">
                <div>
                  <h2>{template.name}</h2>
                  <p className="template-meta">
                    Updated {formatDateTime(template.updatedAt, session.user.timezone)}
                    {` · created ${formatDateTime(
                      template.createdAt,
                      session.user.timezone,
                    )}`}
                  </p>
                </div>
                <code>{template.id}</code>
              </div>

              {canUpdate ? (
                <form action={updateTemplateAction} className="template-form">
                  <input name="templateId" type="hidden" value={template.id} />
                  <div className="template-form-heading">
                    <div className="field">
                      <label htmlFor={`template-name-${template.id}`}>Name</label>
                      <input
                        defaultValue={template.name}
                        id={`template-name-${template.id}`}
                        maxLength={120}
                        name="name"
                        required
                        type="text"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`template-subject-${template.id}`}>
                        Subject
                      </label>
                      <input
                        defaultValue={template.subject}
                        id={`template-subject-${template.id}`}
                        maxLength={998}
                        name="subject"
                        required
                        type="text"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`template-html-${template.id}`}>HTML</label>
                    <textarea
                      defaultValue={template.html ?? ""}
                      id={`template-html-${template.id}`}
                      maxLength={2 * 1024 * 1024}
                      name="html"
                      rows={7}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`template-text-${template.id}`}>
                      Plain text
                    </label>
                    <textarea
                      defaultValue={template.text ?? ""}
                      id={`template-text-${template.id}`}
                      maxLength={2 * 1024 * 1024}
                      name="text"
                      rows={5}
                    />
                  </div>
                  <button className="btn btn-primary" type="submit">
                    Save changes
                  </button>
                </form>
              ) : (
                <div className="template-readonly">
                  <h3>Subject</h3>
                  <pre>{template.subject}</pre>
                  {template.html ? (
                    <>
                      <h3>HTML</h3>
                      <pre>{template.html}</pre>
                    </>
                  ) : null}
                  {template.text ? (
                    <>
                      <h3>Plain text</h3>
                      <pre>{template.text}</pre>
                    </>
                  ) : null}
                </div>
              )}

              {canDelete ? (
                <details className="template-delete">
                  <summary>Delete template</summary>
                  <form action={deleteTemplateAction}>
                    <input name="templateId" type="hidden" value={template.id} />
                    <label>
                      <input name="confirm" required type="checkbox" value="yes" />{" "}
                      Permanently delete {template.name}
                    </label>
                    <button className="btn btn-danger" type="submit">
                      Delete permanently
                    </button>
                  </form>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
