import Link from "next/link";
import { previewBroadcastAction } from "./actions";
import { TemplatePreviewForm } from "@/app/app/templates/[templateId]/preview/preview-form";
import { getBroadcast } from "@/lib/broadcasts";
import { requireOrganization } from "@/lib/session";
import { previewTemplate, templateSampleData } from "@/lib/template-core";
import { formatDateTime } from "@/lib/time";

type BroadcastPreviewPageProps = {
  params: Promise<{ broadcastId: string }>;
};

export default async function BroadcastPreviewPage({
  params,
}: BroadcastPreviewPageProps) {
  const [{ organization, session }, { broadcastId }] = await Promise.all([
    requireOrganization(),
    params,
  ]);
  const broadcast = await getBroadcast({
    actorUserId: session.user.id,
    broadcastId,
    orgId: organization.id,
  });
  const snapshot = {
    html: broadcast.templateHtml,
    requiredVariables: broadcast.templateRequiredVariables,
    subject: broadcast.templateSubject,
    text: broadcast.templateText,
  };
  const sampleData = templateSampleData(snapshot);
  const initialPreview = previewTemplate(snapshot, sampleData);
  const action = previewBroadcastAction.bind(null, broadcast.id);

  return (
    <section>
      <Link href="/app/broadcasts">← Back to broadcasts</Link>
      <div className="broadcast-preview-heading">
        <div>
          <h1 className="page-title template-preview-title">{broadcast.name}</h1>
          <p className="page-sub">
            Frozen {broadcast.templateName} snapshot · from <code>{broadcast.from}</code>
          </p>
        </div>
        <span className={`pill ${broadcast.status === "completed" ? "pill-accent" : "pill-muted"}`}>
          {broadcast.status}
        </span>
      </div>
      <p className="broadcast-preview-schedule">
        {broadcast.scheduledFor
          ? `Scheduled ${formatDateTime(broadcast.scheduledFor, session.user.timezone)}`
          : `Created ${formatDateTime(broadcast.createdAt, session.user.timezone)}`}
        {` · ${broadcast.progress.total} recipient${broadcast.progress.total === 1 ? "" : "s"} · times use ${session.user.timezone}.`}
      </p>
      <TemplatePreviewForm
        action={action}
        initialData={JSON.stringify(sampleData, null, 2)}
        initialState={{ ...initialPreview, error: null }}
      />
    </section>
  );
}
