import { BroadcastPreviewWorkspace } from "@/components/broadcasts/broadcast-preview-workspace";
import { getAudience } from "@/lib/audiences";
import { getBroadcast } from "@/lib/broadcasts";
import { requireOrganization } from "@/lib/session";
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
  const audience = broadcast.sourceAudienceId
    ? await getAudience({
        actorUserId: session.user.id,
        audienceId: broadcast.sourceAudienceId,
        orgId: organization.id,
      }).catch(() => null)
    : null;
  const eventDate = broadcast.scheduledFor ?? broadcast.createdAt;
  const scheduledLabel = `${broadcast.scheduledFor ? "on " : "since "}${formatDateTime(
    eventDate,
    session.user.timezone,
  )}`;

  return (
    <BroadcastPreviewWorkspace
      audienceName={audience?.name ?? `${broadcast.progress.total} recipients`}
      from={broadcast.from}
      html={broadcast.templateHtml}
      name={broadcast.name}
      scheduledLabel={scheduledLabel}
      status={broadcast.status}
      subject={broadcast.templateSubject}
      userInitial={(session.user.name || session.user.email).trim().charAt(0).toUpperCase()}
    />
  );
}
