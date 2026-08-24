import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailTemplates, orgMembers } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";
import {
  parseCreateTemplateInput,
  parseUpdateTemplateInput,
  previewTemplate,
  renderTemplateForSend,
  TemplateError,
  type TemplatePreview,
  type TemplateRecord,
  type TemplateValidationIssue,
} from "@/lib/template-core";
import { isPostgresErrorCode } from "@/lib/postgres-errors";

const TEMPLATE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const templateSelection = {
  createdAt: emailTemplates.createdAt,
  html: emailTemplates.html,
  id: emailTemplates.id,
  name: emailTemplates.name,
  requiredVariables: emailTemplates.requiredVariables,
  subject: emailTemplates.subject,
  text: emailTemplates.textBody,
  updatedAt: emailTemplates.updatedAt,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUniqueViolation(error: unknown): boolean {
  return isPostgresErrorCode(error, "23505");
}

function requireTemplateId(templateId: string): void {
  if (!TEMPLATE_ID_PATTERN.test(templateId)) {
    throw new TemplateError("TEMPLATE_NOT_FOUND");
  }
}

async function requireOrganizationPermission(input: {
  actorUserId: string;
  orgId: string;
  permission: OrgPermission;
}): Promise<void> {
  const [membership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, input.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .limit(1);

  if (!membership || !isOrgRole(membership.role)) {
    throw new TemplateError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, input.permission);
}

export async function createTemplate(input: {
  actorUserId: string;
  orgId: string;
  payload: unknown;
}): Promise<TemplateRecord> {
  const definition = parseCreateTemplateInput(input.payload);

  try {
    return await db.transaction(async (tx) => {
      const [membership] = await tx
        .select({ role: orgMembers.role })
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, input.orgId),
            eq(orgMembers.userId, input.actorUserId),
          ),
        )
        .for("update");

      if (!membership || !isOrgRole(membership.role)) {
        throw new TemplateError("MEMBERSHIP_REQUIRED");
      }

      requirePermission(membership.role, "templates.create");

      const [created] = await tx
        .insert(emailTemplates)
        .values({
          html: definition.html,
          name: definition.name,
          orgId: input.orgId,
          requiredVariables: definition.requiredVariables,
          subject: definition.subject,
          textBody: definition.text,
        })
        .returning(templateSelection);

      if (!created) {
        throw new TemplateError("TEMPLATE_NOT_FOUND");
      }

      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TemplateError("TEMPLATE_EXISTS");
    }

    throw error;
  }
}

export async function listTemplates(input: {
  actorUserId: string;
  orgId: string;
}): Promise<TemplateRecord[]> {
  await requireOrganizationPermission({
    ...input,
    permission: "templates.read",
  });

  return db
    .select(templateSelection)
    .from(emailTemplates)
    .where(eq(emailTemplates.orgId, input.orgId))
    .orderBy(asc(emailTemplates.name), asc(emailTemplates.id));
}

export async function getTemplate(input: {
  actorUserId: string;
  orgId: string;
  templateId: string;
}): Promise<TemplateRecord> {
  requireTemplateId(input.templateId);
  const [row] = await db
    .select({ ...templateSelection, role: orgMembers.role })
    .from(emailTemplates)
    .innerJoin(
      orgMembers,
      and(
        eq(orgMembers.orgId, emailTemplates.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .where(
      and(
        eq(emailTemplates.id, input.templateId),
        eq(emailTemplates.orgId, input.orgId),
      ),
    )
    .limit(1);

  if (!row || !isOrgRole(row.role)) {
    throw new TemplateError("TEMPLATE_NOT_FOUND");
  }

  requirePermission(row.role, "templates.read");
  const { role: _role, ...template } = row;
  return template;
}

export async function updateTemplate(input: {
  actorUserId: string;
  orgId: string;
  payload: unknown;
  templateId: string;
}): Promise<TemplateRecord> {
  requireTemplateId(input.templateId);

  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ ...templateSelection, role: orgMembers.role })
        .from(emailTemplates)
        .innerJoin(
          orgMembers,
          and(
            eq(orgMembers.orgId, emailTemplates.orgId),
            eq(orgMembers.userId, input.actorUserId),
          ),
        )
        .where(
          and(
            eq(emailTemplates.id, input.templateId),
            eq(emailTemplates.orgId, input.orgId),
          ),
        )
        .for("update");

      if (!current || !isOrgRole(current.role)) {
        throw new TemplateError("TEMPLATE_NOT_FOUND");
      }

      requirePermission(current.role, "templates.update");
      const definition = parseUpdateTemplateInput(input.payload, current);
      const [updated] = await tx
        .update(emailTemplates)
        .set({
          html: definition.html,
          name: definition.name,
          requiredVariables: definition.requiredVariables,
          subject: definition.subject,
          textBody: definition.text,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(emailTemplates.id, input.templateId),
            eq(emailTemplates.orgId, input.orgId),
          ),
        )
        .returning(templateSelection);

      if (!updated) {
        throw new TemplateError("TEMPLATE_NOT_FOUND");
      }

      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TemplateError("TEMPLATE_EXISTS");
    }

    throw error;
  }
}

export async function deleteTemplate(input: {
  actorUserId: string;
  orgId: string;
  templateId: string;
}): Promise<void> {
  requireTemplateId(input.templateId);

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ role: orgMembers.role })
      .from(emailTemplates)
      .innerJoin(
        orgMembers,
        and(
          eq(orgMembers.orgId, emailTemplates.orgId),
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .where(
        and(
          eq(emailTemplates.id, input.templateId),
          eq(emailTemplates.orgId, input.orgId),
        ),
      )
      .for("update");

    if (!current || !isOrgRole(current.role)) {
      throw new TemplateError("TEMPLATE_NOT_FOUND");
    }

    requirePermission(current.role, "templates.delete");
    const deleted = await tx
      .delete(emailTemplates)
      .where(
        and(
          eq(emailTemplates.id, input.templateId),
          eq(emailTemplates.orgId, input.orgId),
        ),
      )
      .returning({ id: emailTemplates.id });

    if (deleted.length !== 1) {
      throw new TemplateError("TEMPLATE_NOT_FOUND");
    }
  });
}

async function renderStoredTemplate(input: {
  data: unknown;
  orgId: string;
  templateId: string;
}) {
  const [template] = await db
    .select({
      html: emailTemplates.html,
      requiredVariables: emailTemplates.requiredVariables,
      subject: emailTemplates.subject,
      text: emailTemplates.textBody,
    })
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.id, input.templateId),
        eq(emailTemplates.orgId, input.orgId),
      ),
    )
    .limit(1);

  if (!template) {
    throw new TemplateError("TEMPLATE_NOT_FOUND");
  }

  return renderTemplateForSend(template, input.data);
}

export async function previewStoredTemplate(input: {
  actorUserId: string;
  data: unknown;
  orgId: string;
  templateId: string;
}): Promise<TemplatePreview> {
  const template = await getTemplate(input);
  return previewTemplate(template, input.data);
}

export async function materializeTemplateSendPayload(input: {
  orgId: string;
  payload: unknown;
}): Promise<unknown> {
  if (!isRecord(input.payload)) {
    return input.payload;
  }

  const hasTemplateId = Object.hasOwn(input.payload, "template_id");
  const hasData = Object.hasOwn(input.payload, "data");

  if (!hasTemplateId) {
    if (hasData) {
      throw new TemplateError("VALIDATION_ERROR", [
        {
          field: "data",
          message: "Provide template_id when sending template data.",
        },
      ]);
    }

    return input.payload;
  }

  const issues: TemplateValidationIssue[] = [];
  const templateId = input.payload.template_id;

  if (typeof templateId !== "string" || !TEMPLATE_ID_PATTERN.test(templateId)) {
    issues.push({ field: "template_id", message: "Provide a valid template UUID." });
  }

  for (const field of ["subject", "html", "text"] as const) {
    if (Object.hasOwn(input.payload, field)) {
      issues.push({
        field,
        message: "Do not combine inline content with template_id.",
      });
    }
  }

  if (issues.length > 0 || typeof templateId !== "string") {
    throw new TemplateError("VALIDATION_ERROR", issues);
  }

  const rendered = await renderStoredTemplate({
    data: hasData ? input.payload.data : {},
    orgId: input.orgId,
    templateId,
  });
  const prepared = { ...input.payload };
  delete prepared.template_id;
  delete prepared.data;
  delete prepared.subject;
  delete prepared.html;
  delete prepared.text;
  prepared.subject = rendered.subject;

  if (rendered.html !== null) {
    prepared.html = rendered.html;
  }

  if (rendered.text !== null) {
    prepared.text = rendered.text;
  }

  return prepared;
}

export type { TemplateDefinition, TemplateRecord } from "@/lib/template-core";
