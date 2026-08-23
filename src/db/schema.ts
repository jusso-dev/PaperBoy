import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { DomainDnsCheckSnapshot } from "@/lib/domain-core";
import type { DkimKeyStatus } from "@/lib/dkim-core";
import type {
  EmailTag,
  MessageDeliveryMode,
  MessageStatus,
} from "@/lib/email-core";

export const orgs = pgTable("orgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    timezone: text("timezone").default("UTC").notNull(),
    defaultOrgId: uuid("default_org_id").references(() => orgs.id, {
      onDelete: "set null",
    }),
    activeOrgId: uuid("active_org_id").references(() => orgs.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_default_org_id_unique").on(table.defaultOrgId),
    index("users_active_org_id_idx").on(table.activeOrgId),
  ],
);

export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("org_members_org_id_user_id_unique").on(
      table.orgId,
      table.userId,
    ),
    index("org_members_org_id_idx").on(table.orgId),
    index("org_members_user_id_idx").on(table.userId),
    check(
      "org_members_role_check",
      sql`${table.role} in ('owner', 'admin', 'member')`,
    ),
  ],
);

export const orgInvites = pgTable(
  "org_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").default("member").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("org_invites_org_id_email_unique").on(
      table.orgId,
      table.email,
    ),
    index("org_invites_org_id_idx").on(table.orgId),
    index("org_invites_email_idx").on(table.email),
    check(
      "org_invites_role_check",
      sql`${table.role} in ('admin', 'member')`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("accounts_issuer_account_id_unique").on(
      table.issuer,
      table.accountId,
    ),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyId: text("key_id").notNull(),
    keyHash: text("key_hash").notNull(),
    environment: text("environment").default("live").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("api_keys_key_id_unique").on(table.keyId),
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    index("api_keys_org_id_idx").on(table.orgId),
    check(
      "api_keys_environment_check",
      sql`${table.environment} in ('live', 'test')`,
    ),
  ],
);

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").default("pending").notNull(),
    verificationToken: uuid("verification_token")
      .defaultRandom()
      .notNull(),
    dnsChecks: jsonb("dns_checks").$type<DomainDnsCheckSnapshot>(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("domains_org_id_name_unique").on(table.orgId, table.name),
    uniqueIndex("domains_verification_token_unique").on(
      table.verificationToken,
    ),
    index("domains_name_idx").on(table.name),
    check(
      "domains_status_check",
      sql`${table.status} in ('pending', 'verified')`,
    ),
  ],
);

export const domainDkimKeys = pgTable(
  "domain_dkim_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    selector: text("selector").notNull(),
    publicKey: text("public_key").notNull(),
    encryptedPrivateKey: text("encrypted_private_key"),
    status: text("status").$type<DkimKeyStatus>().default("pending").notNull(),
    dnsStatus: text("dns_status").default("unchecked").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("domain_dkim_keys_domain_id_selector_unique").on(
      table.domainId,
      table.selector,
    ),
    uniqueIndex("domain_dkim_keys_domain_id_active_unique")
      .on(table.domainId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("domain_dkim_keys_domain_id_pending_unique")
      .on(table.domainId)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex("domain_dkim_keys_domain_id_retiring_unique")
      .on(table.domainId)
      .where(sql`${table.status} = 'retiring'`),
    index("domain_dkim_keys_domain_id_idx").on(table.domainId),
    check(
      "domain_dkim_keys_status_check",
      sql`${table.status} in ('pending', 'active', 'retiring', 'retired')`,
    ),
    check(
      "domain_dkim_keys_dns_status_check",
      sql`${table.dnsStatus} in ('unchecked', 'matched', 'missing', 'error', 'pending')`,
    ),
    check(
      "domain_dkim_keys_private_key_state_check",
      sql`(${table.status} = 'retired' and ${table.encryptedPrivateKey} is null) or (${table.status} <> 'retired' and ${table.encryptedPrivateKey} is not null)`,
    ),
  ],
);

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    html: text("html"),
    textBody: text("text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("email_templates_org_id_name_unique").on(
      table.orgId,
      sql`lower(${table.name})`,
    ),
    index("email_templates_org_id_idx").on(table.orgId),
    check(
      "email_templates_name_length_check",
      sql`char_length(btrim(${table.name})) between 1 and 120`,
    ),
    check(
      "email_templates_subject_length_check",
      sql`char_length(btrim(${table.subject})) between 1 and 998 and ${table.subject} !~ '[\r\n]'`,
    ),
    check(
      "email_templates_html_length_check",
      sql`${table.html} is null or char_length(${table.html}) between 1 and 2097152`,
    ),
    check(
      "email_templates_text_length_check",
      sql`${table.textBody} is null or char_length(${table.textBody}) between 1 and 2097152`,
    ),
    check(
      "email_templates_body_check",
      sql`${table.html} is not null or ${table.textBody} is not null`,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    domainId: uuid("domain_id").references(() => domains.id, {
      onDelete: "set null",
    }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, {
      onDelete: "set null",
    }),
    from: text("from").notNull(),
    to: jsonb("to").$type<string[]>().notNull(),
    subject: text("subject").notNull(),
    html: text("html"),
    textBody: text("text"),
    tags: jsonb("tags")
      .$type<EmailTag[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    environment: text("environment").default("test").notNull(),
    deliveryMode: text("delivery_mode")
      .$type<MessageDeliveryMode>()
      .default("test-sink")
      .notNull(),
    idempotencyKey: text("idempotency_key"),
    requestHash: text("request_hash"),
    status: text("status").$type<MessageStatus>().default("queued").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("messages_api_key_id_idempotency_key_unique")
      .on(table.apiKeyId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index("messages_org_id_idx").on(table.orgId),
    index("messages_domain_id_idx").on(table.domainId),
    index("messages_created_at_idx").on(table.createdAt),
    index("messages_status_created_at_idx").on(table.status, table.createdAt),
    check(
      "messages_status_check",
      sql`${table.status} in ('queued', 'sending', 'sent', 'failed')`,
    ),
    check(
      "messages_environment_check",
      sql`${table.environment} in ('live', 'test')`,
    ),
    check(
      "messages_delivery_mode_check",
      sql`${table.deliveryMode} in ('live', 'test-sink')`,
    ),
    check(
      "messages_to_array_check",
      sql`jsonb_typeof(${table.to}) = 'array'`,
    ),
    check(
      "messages_tags_array_check",
      sql`jsonb_typeof(${table.tags}) = 'array'`,
    ),
    check(
      "messages_body_check",
      sql`${table.html} is not null or ${table.textBody} is not null`,
    ),
    check(
      "messages_idempotency_state_check",
      sql`(${table.idempotencyKey} is null and ${table.requestHash} is null) or (${table.idempotencyKey} is not null and ${table.requestHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      "messages_idempotency_key_length_check",
      sql`${table.idempotencyKey} is null or char_length(${table.idempotencyKey}) between 1 and 256`,
    ),
  ],
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    contentSha256: text("content_sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("message_attachments_storage_key_unique").on(
      table.storageKey,
    ),
    uniqueIndex("message_attachments_message_id_position_unique").on(
      table.messageId,
      table.position,
    ),
    index("message_attachments_message_id_idx").on(table.messageId),
    check(
      "message_attachments_position_check",
      sql`${table.position} between 0 and 99`,
    ),
    check(
      "message_attachments_byte_size_check",
      sql`${table.byteSize} between 1 and 10485760`,
    ),
    check(
      "message_attachments_content_sha256_check",
      sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "message_attachments_filename_length_check",
      sql`char_length(${table.filename}) between 1 and 255`,
    ),
    check(
      "message_attachments_content_type_check",
      sql`${table.contentType} ~ '^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$'`,
    ),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("events_message_id_created_at_idx").on(
      table.messageId,
      table.createdAt,
    ),
  ],
);
