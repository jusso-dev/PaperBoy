import Link from "next/link";
import { previewTemplateAction } from "./actions";
import { TemplatePreviewForm } from "./preview-form";
import { requireOrganization } from "@/lib/session";
import {
  previewTemplate,
  templateSampleData,
} from "@/lib/template-core";
import { formatDateTime } from "@/lib/time";
import { getTemplate } from "@/lib/templates";

type TemplatePreviewPageProps = {
  params: Promise<{ templateId: string }>;
};

export default async function TemplatePreviewPage({
  params,
}: TemplatePreviewPageProps) {
  const [{ organization, session }, { templateId }] = await Promise.all([
    requireOrganization(),
    params,
  ]);
  const template = await getTemplate({
    actorUserId: session.user.id,
    orgId: organization.id,
    templateId,
  });
  const sampleData = templateSampleData(template);
  const initialPreview = previewTemplate(template, sampleData);
  const action = previewTemplateAction.bind(null, template.id);

  return (
    <section>
      <Link href="/app/templates">← Back to templates</Link>
      <h1 className="page-title template-preview-title">{template.name}</h1>
      <p className="page-sub">
        Safe preview only · updated{" "}
        {formatDateTime(template.updatedAt, session.user.timezone)} · times use{" "}
        <code>{session.user.timezone}</code>.
      </p>
      <TemplatePreviewForm
        action={action}
        initialData={JSON.stringify(sampleData, null, 2)}
        initialState={{ ...initialPreview, error: null }}
      />
    </section>
  );
}
