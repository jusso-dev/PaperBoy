/* tslint:disable */
/* eslint-disable */
/**
 * 
 * @export
 * @interface Audience
 */
export interface Audience {
    /**
     * 
     * @type {number}
     * @memberof Audience
     */
    active_contact_count: number;
    /**
     * 
     * @type {number}
     * @memberof Audience
     */
    contact_count: number;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Audience
     */
    created_at: string;
    /**
     * 
     * @type {string}
     * @memberof Audience
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof Audience
     */
    name: string;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Audience
     */
    updated_at: string;
}
/**
 * 
 * @export
 * @interface AudienceInput
 */
export interface AudienceInput {
    /**
     * 
     * @type {string}
     * @memberof AudienceInput
     */
    name: string;
}
/**
 * 
 * @export
 * @interface AudienceListEnvelope
 */
export interface AudienceListEnvelope {
    /**
     * 
     * @type {Array<Audience>}
     * @memberof AudienceListEnvelope
     */
    data: Array<Audience>;
    /**
     * 
     * @type {AudienceListEnvelopeProtocolTimeZoneEnum}
     * @memberof AudienceListEnvelope
     */
    protocol_time_zone: AudienceListEnvelopeProtocolTimeZoneEnum;
}


/**
 * @export
 */
export const AudienceListEnvelopeProtocolTimeZoneEnum = {
    UTC: 'UTC'
} as const;
export type AudienceListEnvelopeProtocolTimeZoneEnum = typeof AudienceListEnvelopeProtocolTimeZoneEnum[keyof typeof AudienceListEnvelopeProtocolTimeZoneEnum];

/**
 * 
 * @export
 * @interface AwsSnsEnvelope
 */
export interface AwsSnsEnvelope {
    [key: string]: any | any;
    /**
     * 
     * @type {string}
     * @memberof AwsSnsEnvelope
     */
    Message: string;
    /**
     * 
     * @type {string}
     * @memberof AwsSnsEnvelope
     */
    MessageId: string;
    /**
     * 
     * @type {string}
     * @memberof AwsSnsEnvelope
     */
    Signature: string;
    /**
     * 
     * @type {AwsSnsEnvelopeSignatureVersionEnum}
     * @memberof AwsSnsEnvelope
     */
    SignatureVersion: AwsSnsEnvelopeSignatureVersionEnum;
    /**
     * 
     * @type {string}
     * @memberof AwsSnsEnvelope
     */
    SigningCertURL: string;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof AwsSnsEnvelope
     */
    Timestamp: string;
    /**
     * 
     * @type {string}
     * @memberof AwsSnsEnvelope
     */
    TopicArn: string;
    /**
     * 
     * @type {AwsSnsEnvelopeTypeEnum}
     * @memberof AwsSnsEnvelope
     */
    Type: AwsSnsEnvelopeTypeEnum;
}


/**
 * @export
 */
export const AwsSnsEnvelopeSignatureVersionEnum = {
    _1: '1',
    _2: '2'
} as const;
export type AwsSnsEnvelopeSignatureVersionEnum = typeof AwsSnsEnvelopeSignatureVersionEnum[keyof typeof AwsSnsEnvelopeSignatureVersionEnum];

/**
 * @export
 */
export const AwsSnsEnvelopeTypeEnum = {
    Notification: 'Notification',
    SubscriptionConfirmation: 'SubscriptionConfirmation',
    UnsubscribeConfirmation: 'UnsubscribeConfirmation'
} as const;
export type AwsSnsEnvelopeTypeEnum = typeof AwsSnsEnvelopeTypeEnum[keyof typeof AwsSnsEnvelopeTypeEnum];

/**
 * 
 * @export
 * @interface Broadcast
 */
export interface Broadcast {
    /**
     * 
     * @type {any}
     * @memberof Broadcast
     */
    cancelled_at: any | null;
    /**
     * 
     * @type {any}
     * @memberof Broadcast
     */
    completed_at: any | null;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Broadcast
     */
    created_at: string;
    /**
     * 
     * @type {BroadcastEnvironmentEnum}
     * @memberof Broadcast
     */
    environment: BroadcastEnvironmentEnum;
    /**
     * 
     * @type {string}
     * @memberof Broadcast
     */
    from: string;
    /**
     * 
     * @type {string}
     * @memberof Broadcast
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof Broadcast
     */
    name: string;
    /**
     * 
     * @type {any}
     * @memberof Broadcast
     */
    paused_at: any | null;
    /**
     * 
     * @type {BroadcastProgress}
     * @memberof Broadcast
     */
    progress: BroadcastProgress;
    /**
     * 
     * @type {any}
     * @memberof Broadcast
     */
    scheduled_at: any | null;
    /**
     * 
     * @type {string}
     * @memberof Broadcast
     */
    source_audience_id: string | null;
    /**
     * 
     * @type {string}
     * @memberof Broadcast
     */
    source_template_id: string | null;
    /**
     * 
     * @type {BroadcastStatusEnum}
     * @memberof Broadcast
     */
    status: BroadcastStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof Broadcast
     */
    subject: string;
    /**
     * 
     * @type {string}
     * @memberof Broadcast
     */
    template_name: string;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Broadcast
     */
    updated_at: string;
}


/**
 * @export
 */
export const BroadcastEnvironmentEnum = {
    live: 'live',
    test: 'test'
} as const;
export type BroadcastEnvironmentEnum = typeof BroadcastEnvironmentEnum[keyof typeof BroadcastEnvironmentEnum];

/**
 * @export
 */
export const BroadcastStatusEnum = {
    scheduled: 'scheduled',
    running: 'running',
    paused: 'paused',
    completed: 'completed',
    cancelled: 'cancelled'
} as const;
export type BroadcastStatusEnum = typeof BroadcastStatusEnum[keyof typeof BroadcastStatusEnum];

/**
 * 
 * @export
 * @interface BroadcastCreateInput
 */
export interface BroadcastCreateInput {
    /**
     * 
     * @type {string}
     * @memberof BroadcastCreateInput
     */
    audience_id: string;
    /**
     * 
     * @type {string}
     * @memberof BroadcastCreateInput
     */
    from: string;
    /**
     * 
     * @type {string}
     * @memberof BroadcastCreateInput
     */
    name: string;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof BroadcastCreateInput
     */
    scheduled_for?: string;
    /**
     * 
     * @type {string}
     * @memberof BroadcastCreateInput
     */
    template_id: string;
}
/**
 * 
 * @export
 * @interface BroadcastEnvelope
 */
export interface BroadcastEnvelope {
    /**
     * 
     * @type {Broadcast}
     * @memberof BroadcastEnvelope
     */
    data: Broadcast;
}
/**
 * 
 * @export
 * @interface BroadcastListEnvelope
 */
export interface BroadcastListEnvelope {
    /**
     * 
     * @type {Array<Broadcast>}
     * @memberof BroadcastListEnvelope
     */
    data: Array<Broadcast>;
}
/**
 * 
 * @export
 * @interface BroadcastProgress
 */
export interface BroadcastProgress {
    /**
     * 
     * @type {number}
     * @memberof BroadcastProgress
     */
    cancelled: number;
    /**
     * 
     * @type {number}
     * @memberof BroadcastProgress
     */
    failed: number;
    /**
     * 
     * @type {number}
     * @memberof BroadcastProgress
     */
    pending: number;
    /**
     * 
     * @type {number}
     * @memberof BroadcastProgress
     */
    processing: number;
    /**
     * 
     * @type {number}
     * @memberof BroadcastProgress
     */
    queued: number;
    /**
     * 
     * @type {number}
     * @memberof BroadcastProgress
     */
    suppressed: number;
    /**
     * 
     * @type {number}
     * @memberof BroadcastProgress
     */
    total: number;
}
/**
 * 
 * @export
 * @interface BroadcastUpdateInput
 */
export interface BroadcastUpdateInput {
    /**
     * 
     * @type {string}
     * @memberof BroadcastUpdateInput
     */
    audience_id?: string;
    /**
     * 
     * @type {string}
     * @memberof BroadcastUpdateInput
     */
    from?: string;
    /**
     * 
     * @type {string}
     * @memberof BroadcastUpdateInput
     */
    html?: string | null;
    /**
     * 
     * @type {string}
     * @memberof BroadcastUpdateInput
     */
    name?: string;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof BroadcastUpdateInput
     */
    scheduled_for?: string;
    /**
     * 
     * @type {string}
     * @memberof BroadcastUpdateInput
     */
    subject?: string;
    /**
     * 
     * @type {string}
     * @memberof BroadcastUpdateInput
     */
    template_id?: string;
}
/**
 * 
 * @export
 * @interface Contact
 */
export interface Contact {
    /**
     * 
     * @type {string}
     * @memberof Contact
     */
    audience_id: string;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Contact
     */
    created_at: string;
    /**
     * 
     * @type {string}
     * @memberof Contact
     */
    email: string;
    /**
     * 
     * @type {string}
     * @memberof Contact
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof Contact
     */
    name: string | null;
    /**
     * 
     * @type {any}
     * @memberof Contact
     */
    unsubscribed_at: any | null;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Contact
     */
    updated_at: string;
}
/**
 * 
 * @export
 * @interface ContactInput
 */
export interface ContactInput {
    /**
     * 
     * @type {string}
     * @memberof ContactInput
     */
    email: string;
    /**
     * 
     * @type {string}
     * @memberof ContactInput
     */
    name?: string | null;
}
/**
 * 
 * @export
 * @interface ContactListEnvelope
 */
export interface ContactListEnvelope {
    /**
     * 
     * @type {Array<Contact>}
     * @memberof ContactListEnvelope
     */
    data: Array<Contact>;
    /**
     * 
     * @type {ContactListEnvelopeProtocolTimeZoneEnum}
     * @memberof ContactListEnvelope
     */
    protocol_time_zone: ContactListEnvelopeProtocolTimeZoneEnum;
}


/**
 * @export
 */
export const ContactListEnvelopeProtocolTimeZoneEnum = {
    UTC: 'UTC'
} as const;
export type ContactListEnvelopeProtocolTimeZoneEnum = typeof ContactListEnvelopeProtocolTimeZoneEnum[keyof typeof ContactListEnvelopeProtocolTimeZoneEnum];

/**
 * 
 * @export
 * @interface DeletedResource
 */
export interface DeletedResource {
    /**
     * 
     * @type {DeletedResourceDeletedEnum}
     * @memberof DeletedResource
     */
    deleted: DeletedResourceDeletedEnum;
    /**
     * 
     * @type {string}
     * @memberof DeletedResource
     */
    id: string;
}


/**
 * @export
 */
export const DeletedResourceDeletedEnum = {
    true: true
} as const;
export type DeletedResourceDeletedEnum = typeof DeletedResourceDeletedEnum[keyof typeof DeletedResourceDeletedEnum];

/**
 * 
 * @export
 * @interface Email
 */
export interface Email {
    /**
     * 
     * @type {Array<StoredAttachment>}
     * @memberof Email
     */
    attachments: Array<StoredAttachment>;
    /**
     * 
     * @type {number}
     * @memberof Email
     */
    attempt_count: number;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Email
     */
    created_at: string;
    /**
     * 
     * @type {EmailDeliveryModeEnum}
     * @memberof Email
     */
    delivery_mode: EmailDeliveryModeEnum;
    /**
     * 
     * @type {string}
     * @memberof Email
     */
    domain_id: string | null;
    /**
     * 
     * @type {EmailEnvironmentEnum}
     * @memberof Email
     */
    environment: EmailEnvironmentEnum;
    /**
     * 
     * @type {any}
     * @memberof Email
     */
    failed_at: any | null;
    /**
     * 
     * @type {string}
     * @memberof Email
     */
    failure_reason: string | null;
    /**
     * 
     * @type {string}
     * @memberof Email
     */
    from: string;
    /**
     * 
     * @type {string}
     * @memberof Email
     */
    html: string | null;
    /**
     * 
     * @type {string}
     * @memberof Email
     */
    id: string;
    /**
     * 
     * @type {any}
     * @memberof Email
     */
    last_attempt_at: any | null;
    /**
     * 
     * @type {string}
     * @memberof Email
     */
    last_error_code: string | null;
    /**
     * 
     * @type {any}
     * @memberof Email
     */
    next_attempt_at: any | null;
    /**
     * 
     * @type {EmailObjectEnum}
     * @memberof Email
     */
    object: EmailObjectEnum;
    /**
     * 
     * @type {boolean}
     * @memberof Email
     */
    open_tracking_enabled: boolean;
    /**
     * 
     * @type {MessageOutboundProvider}
     * @memberof Email
     */
    provider: MessageOutboundProvider;
    /**
     * 
     * @type {any}
     * @memberof Email
     */
    sent_at: any | null;
    /**
     * 
     * @type {EmailStatusEnum}
     * @memberof Email
     */
    status: EmailStatusEnum;
    /**
     * 
     * @type {string}
     * @memberof Email
     */
    subject: string;
    /**
     * 
     * @type {Array<EmailTag>}
     * @memberof Email
     */
    tags: Array<EmailTag>;
    /**
     * 
     * @type {string}
     * @memberof Email
     */
    text: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof Email
     */
    to: Array<string>;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Email
     */
    updated_at: string;
}


/**
 * @export
 */
export const EmailDeliveryModeEnum = {
    live: 'live',
    test_sink: 'test-sink'
} as const;
export type EmailDeliveryModeEnum = typeof EmailDeliveryModeEnum[keyof typeof EmailDeliveryModeEnum];

/**
 * @export
 */
export const EmailEnvironmentEnum = {
    live: 'live',
    test: 'test'
} as const;
export type EmailEnvironmentEnum = typeof EmailEnvironmentEnum[keyof typeof EmailEnvironmentEnum];

/**
 * @export
 */
export const EmailObjectEnum = {
    email: 'email'
} as const;
export type EmailObjectEnum = typeof EmailObjectEnum[keyof typeof EmailObjectEnum];

/**
 * @export
 */
export const EmailStatusEnum = {
    queued: 'queued',
    sending: 'sending',
    sent: 'sent',
    failed: 'failed'
} as const;
export type EmailStatusEnum = typeof EmailStatusEnum[keyof typeof EmailStatusEnum];

/**
 * 
 * @export
 * @interface EmailAttachment
 */
export interface EmailAttachment {
    /**
     * Canonical Base64 file bytes.
     * @type {string}
     * @memberof EmailAttachment
     */
    content: string;
    /**
     * At most 255 UTF-8 bytes; paths and control characters are rejected.
     * @type {string}
     * @memberof EmailAttachment
     */
    filename: string;
    /**
     * 
     * @type {string}
     * @memberof EmailAttachment
     */
    content_type: string;
}
/**
 * 
 * @export
 * @interface EmailBatchEnvelope
 */
export interface EmailBatchEnvelope {
    /**
     * 
     * @type {Array<EmailBatchItem>}
     * @memberof EmailBatchEnvelope
     */
    data: Array<EmailBatchItem>;
}
/**
 * 
 * @export
 * @interface EmailBatchItem
 */
export interface EmailBatchItem {
    /**
     * 
     * @type {string}
     * @memberof EmailBatchItem
     */
    id?: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof EmailBatchItem
     */
    error?: { [key: string]: any; };
}
/**
 * 
 * @export
 * @interface EmailTag
 */
export interface EmailTag {
    /**
     * 
     * @type {string}
     * @memberof EmailTag
     */
    name: string;
    /**
     * 
     * @type {string}
     * @memberof EmailTag
     */
    value: string;
}
/**
 * 
 * @export
 * @interface ErrorEnvelope
 */
export interface ErrorEnvelope {
    /**
     * 
     * @type {ErrorEnvelopeError}
     * @memberof ErrorEnvelope
     */
    error: ErrorEnvelopeError;
}
/**
 * 
 * @export
 * @interface ErrorEnvelopeError
 */
export interface ErrorEnvelopeError {
    /**
     * 
     * @type {string}
     * @memberof ErrorEnvelopeError
     */
    code: string;
    /**
     * 
     * @type {string}
     * @memberof ErrorEnvelopeError
     */
    message: string;
    /**
     * 
     * @type {Array<ValidationIssue>}
     * @memberof ErrorEnvelopeError
     */
    fields?: Array<ValidationIssue>;
    /**
     * 
     * @type {ErrorEnvelopeErrorEnvironmentEnum}
     * @memberof ErrorEnvelopeError
     */
    environment?: ErrorEnvelopeErrorEnvironmentEnum;
    /**
     * 
     * @type {number}
     * @memberof ErrorEnvelopeError
     */
    limit?: number;
    /**
     * 
     * @type {number}
     * @memberof ErrorEnvelopeError
     */
    retry_after_seconds?: number;
}


/**
 * @export
 */
export const ErrorEnvelopeErrorEnvironmentEnum = {
    live: 'live',
    test: 'test'
} as const;
export type ErrorEnvelopeErrorEnvironmentEnum = typeof ErrorEnvelopeErrorEnvironmentEnum[keyof typeof ErrorEnvelopeErrorEnvironmentEnum];

/**
 * 
 * @export
 * @interface InlineEmailInput
 */
export interface InlineEmailInput {
    /**
     * Plain address or `Display name <address@example.com>` form.
     * @type {string}
     * @memberof InlineEmailInput
     */
    from: string;
    /**
     * 
     * @type {Recipients}
     * @memberof InlineEmailInput
     */
    to: Recipients;
    /**
     * 
     * @type {string}
     * @memberof InlineEmailInput
     */
    subject: string;
    /**
     * 
     * @type {string}
     * @memberof InlineEmailInput
     */
    html?: string;
    /**
     * API-key-scoped key with a 24-hour lifetime measured using PostgreSQL UTC instants. A replay does not insert or resubmit a provider message.
     * @type {string}
     * @memberof InlineEmailInput
     */
    idempotency_key?: string;
    /**
     * 
     * @type {string}
     * @memberof InlineEmailInput
     */
    text?: string;
    /**
     * 
     * @type {Array<EmailTag>}
     * @memberof InlineEmailInput
     */
    tags?: Array<EmailTag>;
    /**
     * Decoded bytes across all items may total at most 10 MiB.
     * @type {Array<EmailAttachment>}
     * @memberof InlineEmailInput
     */
    attachments?: Array<EmailAttachment>;
}
/**
 * 
 * @export
 * @interface InlineEmailInputAnyOf
 */
export interface InlineEmailInputAnyOf {
    /**
     * 
     * @type {string}
     * @memberof InlineEmailInputAnyOf
     */
    html: string;
}
/**
 * 
 * @export
 * @interface InlineEmailInputAnyOf1
 */
export interface InlineEmailInputAnyOf1 {
    /**
     * 
     * @type {string}
     * @memberof InlineEmailInputAnyOf1
     */
    text: string;
}
/**
 * 
 * @export
 * @interface ListEmailEvents200Response
 */
export interface ListEmailEvents200Response {
    /**
     * 
     * @type {Array<MessageEvent>}
     * @memberof ListEmailEvents200Response
     */
    data: Array<MessageEvent>;
}
/**
 * 
 * @export
 * @interface MessageEvent
 */
export interface MessageEvent {
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof MessageEvent
     */
    created_at: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof MessageEvent
     */
    data: { [key: string]: any; };
    /**
     * 
     * @type {string}
     * @memberof MessageEvent
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof MessageEvent
     */
    message_id: string;
    /**
     * 
     * @type {MessageEventTypeEnum}
     * @memberof MessageEvent
     */
    type: MessageEventTypeEnum;
}


/**
 * @export
 */
export const MessageEventTypeEnum = {
    queued: 'queued',
    delivered: 'delivered',
    deferred: 'deferred',
    bounced: 'bounced',
    complained: 'complained',
    opened: 'opened'
} as const;
export type MessageEventTypeEnum = typeof MessageEventTypeEnum[keyof typeof MessageEventTypeEnum];


/**
 * 
 * @export
 */
export const MessageOutboundProvider = {
    smtp: 'smtp',
    cloudflare_email: 'cloudflare-email',
    aws_ses: 'aws-ses',
    azure_email: 'azure-email',
    test_sink: 'test-sink'
} as const;
export type MessageOutboundProvider = typeof MessageOutboundProvider[keyof typeof MessageOutboundProvider];

/**
 * 
 * @export
 * @interface OpenTrackingSettings
 */
export interface OpenTrackingSettings {
    /**
     * 
     * @type {boolean}
     * @memberof OpenTrackingSettings
     */
    enabled: boolean;
    /**
     * 
     * @type {OpenTrackingSettingsProtocolTimeZoneEnum}
     * @memberof OpenTrackingSettings
     */
    protocol_time_zone: OpenTrackingSettingsProtocolTimeZoneEnum;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof OpenTrackingSettings
     */
    updated_at: string;
}


/**
 * @export
 */
export const OpenTrackingSettingsProtocolTimeZoneEnum = {
    UTC: 'UTC'
} as const;
export type OpenTrackingSettingsProtocolTimeZoneEnum = typeof OpenTrackingSettingsProtocolTimeZoneEnum[keyof typeof OpenTrackingSettingsProtocolTimeZoneEnum];

/**
 * 
 * @export
 * @interface OpenTrackingUpdateInput
 */
export interface OpenTrackingUpdateInput {
    /**
     * 
     * @type {boolean}
     * @memberof OpenTrackingUpdateInput
     */
    enabled: boolean;
}

/**
 * 
 * @export
 */
export const OutboundProvider = {
    smtp: 'smtp',
    cloudflare_email: 'cloudflare-email',
    aws_ses: 'aws-ses',
    azure_email: 'azure-email'
} as const;
export type OutboundProvider = typeof OutboundProvider[keyof typeof OutboundProvider];

/**
 * 
 * @export
 * @interface OutboundProviderCapabilities
 */
export interface OutboundProviderCapabilities {
    /**
     * 
     * @type {boolean}
     * @memberof OutboundProviderCapabilities
     */
    batch: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof OutboundProviderCapabilities
     */
    events: boolean;
    /**
     * 
     * @type {boolean}
     * @memberof OutboundProviderCapabilities
     */
    scheduling: boolean;
}
/**
 * 
 * @export
 * @interface OutboundProviderConnectionDetails
 */
export interface OutboundProviderConnectionDetails {
    /**
     * 
     * @type {OutboundProviderConnectionDetailsAccountModeEnum}
     * @memberof OutboundProviderConnectionDetails
     */
    account_mode: OutboundProviderConnectionDetailsAccountModeEnum;
    /**
     * 
     * @type {string}
     * @memberof OutboundProviderConnectionDetails
     */
    region: string;
    /**
     * 
     * @type {boolean}
     * @memberof OutboundProviderConnectionDetails
     */
    sending_enabled: boolean;
    /**
     * 
     * @type {Set<string>}
     * @memberof OutboundProviderConnectionDetails
     */
    verified_domains: Set<string>;
}


/**
 * @export
 */
export const OutboundProviderConnectionDetailsAccountModeEnum = {
    sandbox: 'sandbox',
    production: 'production'
} as const;
export type OutboundProviderConnectionDetailsAccountModeEnum = typeof OutboundProviderConnectionDetailsAccountModeEnum[keyof typeof OutboundProviderConnectionDetailsAccountModeEnum];

/**
 * 
 * @export
 * @interface OutboundProviderDomainOverrideInput
 */
export interface OutboundProviderDomainOverrideInput {
    /**
     * 
     * @type {string}
     * @memberof OutboundProviderDomainOverrideInput
     */
    domain_id: string;
    /**
     * 
     * @type {OutboundProvider}
     * @memberof OutboundProviderDomainOverrideInput
     */
    provider: OutboundProvider | null;
}


/**
 * 
 * @export
 * @interface OutboundProviderDomainSetting
 */
export interface OutboundProviderDomainSetting {
    /**
     * 
     * @type {string}
     * @memberof OutboundProviderDomainSetting
     */
    domain_id: string;
    /**
     * 
     * @type {OutboundProvider}
     * @memberof OutboundProviderDomainSetting
     */
    effective_provider: OutboundProvider;
    /**
     * 
     * @type {string}
     * @memberof OutboundProviderDomainSetting
     */
    name: string;
    /**
     * 
     * @type {OutboundProvider}
     * @memberof OutboundProviderDomainSetting
     */
    override_provider: OutboundProvider | null;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof OutboundProviderDomainSetting
     */
    updated_at: string;
}


/**
 * 
 * @export
 * @interface OutboundProviderEventEnvelope
 */
export interface OutboundProviderEventEnvelope {
    /**
     * 
     * @type {Array<OutboundProviderEventResult>}
     * @memberof OutboundProviderEventEnvelope
     */
    data: Array<OutboundProviderEventResult>;
    /**
     * 
     * @type {OutboundProviderEventEnvelopeProtocolTimeZoneEnum}
     * @memberof OutboundProviderEventEnvelope
     */
    protocol_time_zone: OutboundProviderEventEnvelopeProtocolTimeZoneEnum;
}


/**
 * @export
 */
export const OutboundProviderEventEnvelopeProtocolTimeZoneEnum = {
    UTC: 'UTC'
} as const;
export type OutboundProviderEventEnvelopeProtocolTimeZoneEnum = typeof OutboundProviderEventEnvelopeProtocolTimeZoneEnum[keyof typeof OutboundProviderEventEnvelopeProtocolTimeZoneEnum];

/**
 * 
 * @export
 * @interface OutboundProviderEventResult
 */
export interface OutboundProviderEventResult {
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof OutboundProviderEventResult
     */
    created_at: string;
    /**
     * 
     * @type {string}
     * @memberof OutboundProviderEventResult
     */
    event_id: string;
    /**
     * 
     * @type {string}
     * @memberof OutboundProviderEventResult
     */
    message_id: string;
    /**
     * 
     * @type {OutboundProviderEventResultProviderEnum}
     * @memberof OutboundProviderEventResult
     */
    provider: OutboundProviderEventResultProviderEnum;
    /**
     * 
     * @type {string}
     * @memberof OutboundProviderEventResult
     */
    provider_event_id: string;
    /**
     * 
     * @type {boolean}
     * @memberof OutboundProviderEventResult
     */
    replayed: boolean;
    /**
     * 
     * @type {number}
     * @memberof OutboundProviderEventResult
     */
    suppression_count: number;
    /**
     * 
     * @type {OutboundProviderEventResultTypeEnum}
     * @memberof OutboundProviderEventResult
     */
    type: OutboundProviderEventResultTypeEnum;
}


/**
 * @export
 */
export const OutboundProviderEventResultProviderEnum = {
    aws_ses: 'aws-ses'
} as const;
export type OutboundProviderEventResultProviderEnum = typeof OutboundProviderEventResultProviderEnum[keyof typeof OutboundProviderEventResultProviderEnum];

/**
 * @export
 */
export const OutboundProviderEventResultTypeEnum = {
    delivered: 'delivered',
    deferred: 'deferred',
    bounced: 'bounced',
    complained: 'complained'
} as const;
export type OutboundProviderEventResultTypeEnum = typeof OutboundProviderEventResultTypeEnum[keyof typeof OutboundProviderEventResultTypeEnum];

/**
 * 
 * @export
 * @interface OutboundProviderSettings
 */
export interface OutboundProviderSettings {
    /**
     * 
     * @type {OutboundProvider}
     * @memberof OutboundProviderSettings
     */
    default_provider: OutboundProvider;
    /**
     * 
     * @type {Array<OutboundProviderDomainSetting>}
     * @memberof OutboundProviderSettings
     */
    domains: Array<OutboundProviderDomainSetting>;
    /**
     * 
     * @type {OutboundProviderSettingsProtocolTimeZoneEnum}
     * @memberof OutboundProviderSettings
     */
    protocol_time_zone: OutboundProviderSettingsProtocolTimeZoneEnum;
    /**
     * 
     * @type {Array<OutboundProviderStatus>}
     * @memberof OutboundProviderSettings
     */
    providers: Array<OutboundProviderStatus>;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof OutboundProviderSettings
     */
    updated_at: string;
}


/**
 * @export
 */
export const OutboundProviderSettingsProtocolTimeZoneEnum = {
    UTC: 'UTC'
} as const;
export type OutboundProviderSettingsProtocolTimeZoneEnum = typeof OutboundProviderSettingsProtocolTimeZoneEnum[keyof typeof OutboundProviderSettingsProtocolTimeZoneEnum];

/**
 * 
 * @export
 * @interface OutboundProviderStatus
 */
export interface OutboundProviderStatus {
    /**
     * 
     * @type {OutboundProviderCapabilities}
     * @memberof OutboundProviderStatus
     */
    capabilities: OutboundProviderCapabilities;
    /**
     * 
     * @type {boolean}
     * @memberof OutboundProviderStatus
     */
    configured: boolean;
    /**
     * 
     * @type {OutboundProviderStatusCredentialScopeEnum}
     * @memberof OutboundProviderStatus
     */
    credential_scope: OutboundProviderStatusCredentialScopeEnum | null;
    /**
     * 
     * @type {OutboundProvider}
     * @memberof OutboundProviderStatus
     */
    id: OutboundProvider;
    /**
     * 
     * @type {string}
     * @memberof OutboundProviderStatus
     */
    label: string;
    /**
     * 
     * @type {OutboundProviderStatusStateEnum}
     * @memberof OutboundProviderStatus
     */
    state: OutboundProviderStatusStateEnum;
}


/**
 * @export
 */
export const OutboundProviderStatusCredentialScopeEnum = {
    operator_default: 'operator-default',
    organization: 'organization'
} as const;
export type OutboundProviderStatusCredentialScopeEnum = typeof OutboundProviderStatusCredentialScopeEnum[keyof typeof OutboundProviderStatusCredentialScopeEnum];

/**
 * @export
 */
export const OutboundProviderStatusStateEnum = {
    adapter_unavailable: 'adapter-unavailable',
    configuration_invalid: 'configuration-invalid',
    credentials_missing: 'credentials-missing',
    ready: 'ready'
} as const;
export type OutboundProviderStatusStateEnum = typeof OutboundProviderStatusStateEnum[keyof typeof OutboundProviderStatusStateEnum];

/**
 * 
 * @export
 * @interface OutboundProviderTestInput
 */
export interface OutboundProviderTestInput {
    /**
     * 
     * @type {OutboundProvider}
     * @memberof OutboundProviderTestInput
     */
    provider: OutboundProvider;
}


/**
 * 
 * @export
 * @interface OutboundProviderTestResult
 */
export interface OutboundProviderTestResult {
    /**
     * 
     * @type {OutboundProviderConnectionDetails}
     * @memberof OutboundProviderTestResult
     */
    details: OutboundProviderConnectionDetails | null;
    /**
     * 
     * @type {OutboundProviderTestResultOkEnum}
     * @memberof OutboundProviderTestResult
     */
    ok: OutboundProviderTestResultOkEnum;
    /**
     * 
     * @type {OutboundProviderTestResultProtocolTimeZoneEnum}
     * @memberof OutboundProviderTestResult
     */
    protocol_time_zone: OutboundProviderTestResultProtocolTimeZoneEnum;
    /**
     * 
     * @type {OutboundProvider}
     * @memberof OutboundProviderTestResult
     */
    provider: OutboundProvider;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof OutboundProviderTestResult
     */
    tested_at: string;
}


/**
 * @export
 */
export const OutboundProviderTestResultOkEnum = {
    true: true
} as const;
export type OutboundProviderTestResultOkEnum = typeof OutboundProviderTestResultOkEnum[keyof typeof OutboundProviderTestResultOkEnum];

/**
 * @export
 */
export const OutboundProviderTestResultProtocolTimeZoneEnum = {
    UTC: 'UTC'
} as const;
export type OutboundProviderTestResultProtocolTimeZoneEnum = typeof OutboundProviderTestResultProtocolTimeZoneEnum[keyof typeof OutboundProviderTestResultProtocolTimeZoneEnum];

/**
 * 
 * @export
 * @interface OutboundProviderUpdateInput
 */
export interface OutboundProviderUpdateInput {
    /**
     * 
     * @type {OutboundProvider}
     * @memberof OutboundProviderUpdateInput
     */
    default_provider?: OutboundProvider;
    /**
     * 
     * @type {Array<OutboundProviderDomainOverrideInput>}
     * @memberof OutboundProviderUpdateInput
     */
    domain_overrides?: Array<OutboundProviderDomainOverrideInput>;
}


/**
 * 
 * @export
 * @interface QueuedEmail
 */
export interface QueuedEmail {
    /**
     * 
     * @type {string}
     * @memberof QueuedEmail
     */
    id: string;
}
/**
 * 
 * @export
 * @interface RateLimitErrorEnvelope
 */
export interface RateLimitErrorEnvelope {
    /**
     * 
     * @type {RateLimitErrorEnvelopeError}
     * @memberof RateLimitErrorEnvelope
     */
    error: RateLimitErrorEnvelopeError;
}
/**
 * 
 * @export
 * @interface RateLimitErrorEnvelopeError
 */
export interface RateLimitErrorEnvelopeError {
    /**
     * 
     * @type {RateLimitErrorEnvelopeErrorCodeEnum}
     * @memberof RateLimitErrorEnvelopeError
     */
    code: RateLimitErrorEnvelopeErrorCodeEnum;
    /**
     * 
     * @type {RateLimitErrorEnvelopeErrorEnvironmentEnum}
     * @memberof RateLimitErrorEnvelopeError
     */
    environment: RateLimitErrorEnvelopeErrorEnvironmentEnum;
    /**
     * 
     * @type {number}
     * @memberof RateLimitErrorEnvelopeError
     */
    limit: number;
    /**
     * 
     * @type {string}
     * @memberof RateLimitErrorEnvelopeError
     */
    message: string;
    /**
     * 
     * @type {number}
     * @memberof RateLimitErrorEnvelopeError
     */
    retry_after_seconds: number;
}


/**
 * @export
 */
export const RateLimitErrorEnvelopeErrorCodeEnum = {
    rate_limit_exceeded: 'rate_limit_exceeded'
} as const;
export type RateLimitErrorEnvelopeErrorCodeEnum = typeof RateLimitErrorEnvelopeErrorCodeEnum[keyof typeof RateLimitErrorEnvelopeErrorCodeEnum];

/**
 * @export
 */
export const RateLimitErrorEnvelopeErrorEnvironmentEnum = {
    live: 'live',
    test: 'test'
} as const;
export type RateLimitErrorEnvelopeErrorEnvironmentEnum = typeof RateLimitErrorEnvelopeErrorEnvironmentEnum[keyof typeof RateLimitErrorEnvelopeErrorEnvironmentEnum];

/**
 * 
 * @export
 * @interface RateLimitLane
 */
export interface RateLimitLane {
    /**
     * 
     * @type {number}
     * @memberof RateLimitLane
     */
    default_limit_per_minute: number;
    /**
     * 
     * @type {number}
     * @memberof RateLimitLane
     */
    limit_per_minute: number;
    /**
     * 
     * @type {number}
     * @memberof RateLimitLane
     */
    override_limit_per_minute: number | null;
}
/**
 * 
 * @export
 * @interface RateLimitSettings
 */
export interface RateLimitSettings {
    /**
     * 
     * @type {RateLimitLane}
     * @memberof RateLimitSettings
     */
    live: RateLimitLane;
    /**
     * 
     * @type {RateLimitSettingsProtocolTimeZoneEnum}
     * @memberof RateLimitSettings
     */
    protocol_time_zone: RateLimitSettingsProtocolTimeZoneEnum;
    /**
     * 
     * @type {RateLimitLane}
     * @memberof RateLimitSettings
     */
    test: RateLimitLane;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof RateLimitSettings
     */
    updated_at: string;
}


/**
 * @export
 */
export const RateLimitSettingsProtocolTimeZoneEnum = {
    UTC: 'UTC'
} as const;
export type RateLimitSettingsProtocolTimeZoneEnum = typeof RateLimitSettingsProtocolTimeZoneEnum[keyof typeof RateLimitSettingsProtocolTimeZoneEnum];

/**
 * 
 * @export
 * @interface RateLimitUpdateInput
 */
export interface RateLimitUpdateInput {
    /**
     * 
     * @type {number}
     * @memberof RateLimitUpdateInput
     */
    live_limit_per_minute?: number | null;
    /**
     * 
     * @type {number}
     * @memberof RateLimitUpdateInput
     */
    test_limit_per_minute?: number | null;
}
/**
 * @type Recipients
 * 
 * @export
 */
export type Recipients = Array<string> | string;
/**
 * @type SendEmailInput
 * 
 * @export
 */
export type SendEmailInput = InlineEmailInput | TemplateEmailInput;
/**
 * 
 * @export
 * @interface StoredAttachment
 */
export interface StoredAttachment {
    /**
     * 
     * @type {string}
     * @memberof StoredAttachment
     */
    content_type: string;
    /**
     * 
     * @type {string}
     * @memberof StoredAttachment
     */
    filename: string;
    /**
     * 
     * @type {string}
     * @memberof StoredAttachment
     */
    id: string;
    /**
     * 
     * @type {number}
     * @memberof StoredAttachment
     */
    size: number;
}
/**
 * 
 * @export
 * @interface Suppression
 */
export interface Suppression {
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Suppression
     */
    created_at: string;
    /**
     * 
     * @type {string}
     * @memberof Suppression
     */
    email: string;
    /**
     * 
     * @type {string}
     * @memberof Suppression
     */
    id: string;
    /**
     * 
     * @type {SuppressionReason}
     * @memberof Suppression
     */
    reason: SuppressionReason;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Suppression
     */
    updated_at: string;
}


/**
 * 
 * @export
 * @interface SuppressionInput
 */
export interface SuppressionInput {
    /**
     * 
     * @type {string}
     * @memberof SuppressionInput
     */
    email: string;
    /**
     * 
     * @type {SuppressionReason}
     * @memberof SuppressionInput
     */
    reason: SuppressionReason;
}


/**
 * 
 * @export
 * @interface SuppressionListEnvelope
 */
export interface SuppressionListEnvelope {
    /**
     * 
     * @type {Array<Suppression>}
     * @memberof SuppressionListEnvelope
     */
    data: Array<Suppression>;
    /**
     * 
     * @type {SuppressionListEnvelopeProtocolTimeZoneEnum}
     * @memberof SuppressionListEnvelope
     */
    protocol_time_zone: SuppressionListEnvelopeProtocolTimeZoneEnum;
}


/**
 * @export
 */
export const SuppressionListEnvelopeProtocolTimeZoneEnum = {
    UTC: 'UTC'
} as const;
export type SuppressionListEnvelopeProtocolTimeZoneEnum = typeof SuppressionListEnvelopeProtocolTimeZoneEnum[keyof typeof SuppressionListEnvelopeProtocolTimeZoneEnum];


/**
 * 
 * @export
 */
export const SuppressionReason = {
    manual: 'manual',
    unsubscribed: 'unsubscribed',
    bounced: 'bounced',
    complained: 'complained'
} as const;
export type SuppressionReason = typeof SuppressionReason[keyof typeof SuppressionReason];

/**
 * 
 * @export
 * @interface SuppressionUpdateInput
 */
export interface SuppressionUpdateInput {
    /**
     * 
     * @type {string}
     * @memberof SuppressionUpdateInput
     */
    email?: string;
    /**
     * 
     * @type {SuppressionReason}
     * @memberof SuppressionUpdateInput
     */
    reason?: SuppressionReason;
}


/**
 * 
 * @export
 * @interface Template
 */
export interface Template {
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Template
     */
    created_at: string;
    /**
     * 
     * @type {string}
     * @memberof Template
     */
    html: string | null;
    /**
     * 
     * @type {string}
     * @memberof Template
     */
    id: string;
    /**
     * 
     * @type {string}
     * @memberof Template
     */
    name: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof Template
     */
    required_variables: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof Template
     */
    subject: string;
    /**
     * 
     * @type {string}
     * @memberof Template
     */
    text: string | null;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof Template
     */
    updated_at: string;
}
/**
 * 
 * @export
 * @interface TemplateEmailInput
 */
export interface TemplateEmailInput {
    /**
     * Plain address or `Display name <address@example.com>` form.
     * @type {string}
     * @memberof TemplateEmailInput
     */
    from: string;
    /**
     * 
     * @type {Recipients}
     * @memberof TemplateEmailInput
     */
    to: Recipients;
    /**
     * 
     * @type {string}
     * @memberof TemplateEmailInput
     */
    template_id: string;
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof TemplateEmailInput
     */
    data?: { [key: string]: any; };
    /**
     * API-key-scoped key with a 24-hour lifetime measured using PostgreSQL UTC instants. A replay does not insert or resubmit a provider message.
     * @type {string}
     * @memberof TemplateEmailInput
     */
    idempotency_key?: string;
    /**
     * 
     * @type {Array<EmailTag>}
     * @memberof TemplateEmailInput
     */
    tags?: Array<EmailTag>;
    /**
     * Decoded bytes across all items may total at most 10 MiB.
     * @type {Array<EmailAttachment>}
     * @memberof TemplateEmailInput
     */
    attachments?: Array<EmailAttachment>;
}
/**
 * 
 * @export
 * @interface TemplateInput
 */
export interface TemplateInput {
    /**
     * 
     * @type {string}
     * @memberof TemplateInput
     */
    html?: string | null;
    /**
     * 
     * @type {string}
     * @memberof TemplateInput
     */
    name: string;
    /**
     * 
     * @type {Array<string>}
     * @memberof TemplateInput
     */
    required_variables?: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof TemplateInput
     */
    subject: string;
    /**
     * 
     * @type {string}
     * @memberof TemplateInput
     */
    text?: string | null;
}
/**
 * 
 * @export
 * @interface TemplateListEnvelope
 */
export interface TemplateListEnvelope {
    /**
     * 
     * @type {Array<Template>}
     * @memberof TemplateListEnvelope
     */
    data: Array<Template>;
}
/**
 * 
 * @export
 * @interface TemplatePreview
 */
export interface TemplatePreview {
    /**
     * 
     * @type {string}
     * @memberof TemplatePreview
     */
    html: string | null;
    /**
     * 
     * @type {Array<string>}
     * @memberof TemplatePreview
     */
    missing_variables: Array<string>;
    /**
     * 
     * @type {string}
     * @memberof TemplatePreview
     */
    subject: string;
    /**
     * 
     * @type {string}
     * @memberof TemplatePreview
     */
    template_id: string;
    /**
     * 
     * @type {string}
     * @memberof TemplatePreview
     */
    text: string | null;
}
/**
 * 
 * @export
 * @interface TemplatePreviewInput
 */
export interface TemplatePreviewInput {
    /**
     * 
     * @type {{ [key: string]: any; }}
     * @memberof TemplatePreviewInput
     */
    data?: { [key: string]: any; };
}
/**
 * 
 * @export
 * @interface ValidationIssue
 */
export interface ValidationIssue {
    /**
     * 
     * @type {string}
     * @memberof ValidationIssue
     */
    field: string;
    /**
     * 
     * @type {string}
     * @memberof ValidationIssue
     */
    message: string;
}
/**
 * 
 * @export
 * @interface WebhookConfigurationEnvelope
 */
export interface WebhookConfigurationEnvelope {
    /**
     * 
     * @type {WebhookConfiguredEndpoint}
     * @memberof WebhookConfigurationEnvelope
     */
    data: WebhookConfiguredEndpoint;
}
/**
 * 
 * @export
 * @interface WebhookConfigurationInput
 */
export interface WebhookConfigurationInput {
    /**
     * HTTPS URL without embedded credentials or a fragment.
     * @type {string}
     * @memberof WebhookConfigurationInput
     */
    url: string;
}
/**
 * 
 * @export
 * @interface WebhookConfiguredEndpoint
 */
export interface WebhookConfiguredEndpoint {
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof WebhookConfiguredEndpoint
     */
    created_at: string;
    /**
     * 
     * @type {string}
     * @memberof WebhookConfiguredEndpoint
     */
    id: string;
    /**
     * Returned only on first creation and never by GET.
     * @type {string}
     * @memberof WebhookConfiguredEndpoint
     */
    signing_secret: string | null;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof WebhookConfiguredEndpoint
     */
    updated_at: string;
    /**
     * 
     * @type {string}
     * @memberof WebhookConfiguredEndpoint
     */
    url: string;
}
/**
 * 
 * @export
 * @interface WebhookEndpoint
 */
export interface WebhookEndpoint {
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof WebhookEndpoint
     */
    created_at: string;
    /**
     * 
     * @type {string}
     * @memberof WebhookEndpoint
     */
    id: string;
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof WebhookEndpoint
     */
    updated_at: string;
    /**
     * 
     * @type {string}
     * @memberof WebhookEndpoint
     */
    url: string;
}
/**
 * 
 * @export
 * @interface WebhookEvent
 */
export interface WebhookEvent {
    /**
     * RFC 3339 UTC instant. PaperBoy serializes this with a trailing `Z`.
     * @type {string}
     * @memberof WebhookEvent
     */
    created_at: string;
    /**
     * 
     * @type {WebhookEventData}
     * @memberof WebhookEvent
     */
    data: WebhookEventData;
    /**
     * 
     * @type {WebhookEventTypeEnum}
     * @memberof WebhookEvent
     */
    type: WebhookEventTypeEnum;
}


/**
 * @export
 */
export const WebhookEventTypeEnum = {
    email_queued: 'email.queued',
    email_delivered: 'email.delivered',
    email_deferred: 'email.deferred',
    email_bounced: 'email.bounced',
    email_complained: 'email.complained',
    email_opened: 'email.opened'
} as const;
export type WebhookEventTypeEnum = typeof WebhookEventTypeEnum[keyof typeof WebhookEventTypeEnum];

/**
 * 
 * @export
 * @interface WebhookEventData
 */
export interface WebhookEventData {
    /**
     * 
     * @type {string}
     * @memberof WebhookEventData
     */
    email_id: string;
    /**
     * 
     * @type {WebhookEventDataEnvironmentEnum}
     * @memberof WebhookEventData
     */
    environment: WebhookEventDataEnvironmentEnum;
}


/**
 * @export
 */
export const WebhookEventDataEnvironmentEnum = {
    live: 'live',
    test: 'test'
} as const;
export type WebhookEventDataEnvironmentEnum = typeof WebhookEventDataEnvironmentEnum[keyof typeof WebhookEventDataEnvironmentEnum];

/**
 * 
 * @export
 * @interface WebhookReadEnvelope
 */
export interface WebhookReadEnvelope {
    /**
     * 
     * @type {WebhookEndpoint}
     * @memberof WebhookReadEnvelope
     */
    data: WebhookEndpoint | null;
}
