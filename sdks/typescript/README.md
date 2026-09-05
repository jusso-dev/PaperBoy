# @paperboy/openapi@1.0.0

A TypeScript SDK client for the localhost API.

## Usage

First, install the SDK from npm.

```bash
npm install @paperboy/openapi --save
```

Next, try it out.


```ts
import {
  Configuration,
  AudiencesApi,
} from '@paperboy/openapi';
import type { CreateAudienceRequest } from '@paperboy/openapi';

async function example() {
  console.log("🚀 Testing @paperboy/openapi SDK...");
  const config = new Configuration({ 
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new AudiencesApi(config);

  const body = {
    // AudienceInput
    audienceInput: ...,
  } satisfies CreateAudienceRequest;

  try {
    const data = await api.createAudience(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```


## Documentation

### API Endpoints

All URIs are relative to *http://localhost*

| Class | Method | HTTP request | Description
| ----- | ------ | ------------ | -------------
*AudiencesApi* | [**createAudience**](docs/AudiencesApi.md#createaudience) | **POST** /api/v1/audiences | Create one audience
*AudiencesApi* | [**createContact**](docs/AudiencesApi.md#createcontact) | **POST** /api/v1/audiences/{audienceId}/contacts | Add one contact
*AudiencesApi* | [**deleteAudience**](docs/AudiencesApi.md#deleteaudience) | **DELETE** /api/v1/audiences/{audienceId} | Delete one audience
*AudiencesApi* | [**deleteContact**](docs/AudiencesApi.md#deletecontact) | **DELETE** /api/v1/audiences/{audienceId}/contacts/{contactId} | Delete one contact
*AudiencesApi* | [**getAudience**](docs/AudiencesApi.md#getaudience) | **GET** /api/v1/audiences/{audienceId} | Get one audience
*AudiencesApi* | [**getContact**](docs/AudiencesApi.md#getcontact) | **GET** /api/v1/audiences/{audienceId}/contacts/{contactId} | Get one contact
*AudiencesApi* | [**importContacts**](docs/AudiencesApi.md#importcontacts) | **POST** /api/v1/audiences/{audienceId}/contacts/import | Import contacts from CSV
*AudiencesApi* | [**listAudiences**](docs/AudiencesApi.md#listaudiences) | **GET** /api/v1/audiences | List audiences
*AudiencesApi* | [**listContacts**](docs/AudiencesApi.md#listcontacts) | **GET** /api/v1/audiences/{audienceId}/contacts | List audience contacts
*AudiencesApi* | [**updateAudience**](docs/AudiencesApi.md#updateaudience) | **PATCH** /api/v1/audiences/{audienceId} | Rename one audience
*AudiencesApi* | [**updateContact**](docs/AudiencesApi.md#updatecontact) | **PATCH** /api/v1/audiences/{audienceId}/contacts/{contactId} | Update one contact
*BroadcastsApi* | [**cancelBroadcast**](docs/BroadcastsApi.md#cancelbroadcast) | **POST** /api/v1/broadcasts/{broadcastId}/cancel | Cancel a broadcast
*BroadcastsApi* | [**createBroadcast**](docs/BroadcastsApi.md#createbroadcast) | **POST** /api/v1/broadcasts | Create one broadcast
*BroadcastsApi* | [**getBroadcast**](docs/BroadcastsApi.md#getbroadcast) | **GET** /api/v1/broadcasts/{broadcastId} | Get one broadcast
*BroadcastsApi* | [**listBroadcasts**](docs/BroadcastsApi.md#listbroadcasts) | **GET** /api/v1/broadcasts | List broadcasts
*BroadcastsApi* | [**pauseBroadcast**](docs/BroadcastsApi.md#pausebroadcast) | **POST** /api/v1/broadcasts/{broadcastId}/pause | Pause a running broadcast
*BroadcastsApi* | [**resumeBroadcast**](docs/BroadcastsApi.md#resumebroadcast) | **POST** /api/v1/broadcasts/{broadcastId}/resume | Resume a paused broadcast
*BroadcastsApi* | [**updateBroadcast**](docs/BroadcastsApi.md#updatebroadcast) | **PATCH** /api/v1/broadcasts/{broadcastId} | Update a scheduled broadcast
*EmailsApi* | [**getEmail**](docs/EmailsApi.md#getemail) | **GET** /api/v1/emails/{emailId} | Get one email
*EmailsApi* | [**getReceivedEmail**](docs/EmailsApi.md#getreceivedemail) | **GET** /api/v1/received-emails/{emailId} | Get one inbound email
*EmailsApi* | [**receiveInboundEmail**](docs/EmailsApi.md#receiveinboundemail) | **POST** /api/v1/received-emails | Store one inbound email
*EmailsApi* | [**sendEmail**](docs/EmailsApi.md#sendemail) | **POST** /api/v1/emails | Queue one email
*EmailsApi* | [**sendEmailBatch**](docs/EmailsApi.md#sendemailbatch) | **POST** /api/v1/emails/batch | Queue one to 100 emails
*EventsApi* | [**listEmailEvents**](docs/EventsApi.md#listemailevents) | **GET** /api/v1/emails/{emailId}/events | List one email\&#39;s events
*OpenTrackingApi* | [**getOpenTracking**](docs/OpenTrackingApi.md#getopentracking) | **GET** /api/v1/open-tracking | Read organization open tracking
*OpenTrackingApi* | [**recordClick**](docs/OpenTrackingApi.md#recordclick) | **GET** /c/{messageId}/{signature} | Follow a signed first-party click redirect
*OpenTrackingApi* | [**recordOpen**](docs/OpenTrackingApi.md#recordopen) | **GET** /o/{messageId}/{signature}.gif | Fetch the signed first-party open pixel
*OpenTrackingApi* | [**updateOpenTracking**](docs/OpenTrackingApi.md#updateopentracking) | **PATCH** /api/v1/open-tracking | Update organization open tracking
*OutboundProvidersApi* | [**getOutboundProviders**](docs/OutboundProvidersApi.md#getoutboundproviders) | **GET** /api/v1/providers | Read outbound-provider routing
*OutboundProvidersApi* | [**ingestAwsSesEvent**](docs/OutboundProvidersApi.md#ingestawssesevent) | **POST** /api/v1/providers/aws-ses/events | Ingest one Amazon SES event
*OutboundProvidersApi* | [**receiveAwsSesSnsEvent**](docs/OutboundProvidersApi.md#receiveawssessnsevent) | **POST** /api/v1/providers/aws-ses/events/{orgId} | Receive one signed Amazon SNS notification
*OutboundProvidersApi* | [**testOutboundProvider**](docs/OutboundProvidersApi.md#testoutboundprovider) | **POST** /api/v1/providers/test | Test one outbound provider
*OutboundProvidersApi* | [**updateOutboundProviders**](docs/OutboundProvidersApi.md#updateoutboundproviders) | **PATCH** /api/v1/providers | Update outbound-provider routing
*RateLimitsApi* | [**getRateLimits**](docs/RateLimitsApi.md#getratelimits) | **GET** /api/v1/rate-limits | Read organization send-rate limits
*RateLimitsApi* | [**updateRateLimits**](docs/RateLimitsApi.md#updateratelimits) | **PATCH** /api/v1/rate-limits | Override organization send-rate limits
*SuppressionsApi* | [**createSuppression**](docs/SuppressionsApi.md#createsuppression) | **POST** /api/v1/suppressions | Create one suppression
*SuppressionsApi* | [**deleteSuppression**](docs/SuppressionsApi.md#deletesuppression) | **DELETE** /api/v1/suppressions/{suppressionId} | Delete one suppression
*SuppressionsApi* | [**getSuppression**](docs/SuppressionsApi.md#getsuppression) | **GET** /api/v1/suppressions/{suppressionId} | Get one suppression
*SuppressionsApi* | [**importSuppressions**](docs/SuppressionsApi.md#importsuppressions) | **POST** /api/v1/suppressions/import | Import suppressions from CSV
*SuppressionsApi* | [**listSuppressions**](docs/SuppressionsApi.md#listsuppressions) | **GET** /api/v1/suppressions | List suppressions
*SuppressionsApi* | [**updateSuppression**](docs/SuppressionsApi.md#updatesuppression) | **PATCH** /api/v1/suppressions/{suppressionId} | Update one suppression
*TemplatesApi* | [**createTemplate**](docs/TemplatesApi.md#createtemplate) | **POST** /api/v1/templates | Create one template
*TemplatesApi* | [**deleteTemplate**](docs/TemplatesApi.md#deletetemplate) | **DELETE** /api/v1/templates/{templateId} | Delete one template
*TemplatesApi* | [**getTemplate**](docs/TemplatesApi.md#gettemplate) | **GET** /api/v1/templates/{templateId} | Get one template
*TemplatesApi* | [**listTemplates**](docs/TemplatesApi.md#listtemplates) | **GET** /api/v1/templates | List templates
*TemplatesApi* | [**previewTemplate**](docs/TemplatesApi.md#previewtemplate) | **POST** /api/v1/templates/{templateId}/preview | Render one template without sending
*TemplatesApi* | [**updateTemplate**](docs/TemplatesApi.md#updatetemplate) | **PATCH** /api/v1/templates/{templateId} | Update one template
*WebhooksApi* | [**configureWebhook**](docs/WebhooksApi.md#configurewebhook) | **PUT** /api/v1/webhooks | Configure webhook delivery
*WebhooksApi* | [**getWebhook**](docs/WebhooksApi.md#getwebhook) | **GET** /api/v1/webhooks | Read webhook configuration


### Models

- [Audience](docs/Audience.md)
- [AudienceInput](docs/AudienceInput.md)
- [AudienceListEnvelope](docs/AudienceListEnvelope.md)
- [AwsSnsEnvelope](docs/AwsSnsEnvelope.md)
- [Broadcast](docs/Broadcast.md)
- [BroadcastCreateInput](docs/BroadcastCreateInput.md)
- [BroadcastEnvelope](docs/BroadcastEnvelope.md)
- [BroadcastListEnvelope](docs/BroadcastListEnvelope.md)
- [BroadcastProgress](docs/BroadcastProgress.md)
- [BroadcastUpdateInput](docs/BroadcastUpdateInput.md)
- [Contact](docs/Contact.md)
- [ContactInput](docs/ContactInput.md)
- [ContactListEnvelope](docs/ContactListEnvelope.md)
- [DeletedResource](docs/DeletedResource.md)
- [Email](docs/Email.md)
- [EmailAttachment](docs/EmailAttachment.md)
- [EmailBatchEnvelope](docs/EmailBatchEnvelope.md)
- [EmailBatchItem](docs/EmailBatchItem.md)
- [EmailTag](docs/EmailTag.md)
- [ErrorEnvelope](docs/ErrorEnvelope.md)
- [ErrorEnvelopeError](docs/ErrorEnvelopeError.md)
- [InlineEmailInput](docs/InlineEmailInput.md)
- [InlineEmailInputAnyOf](docs/InlineEmailInputAnyOf.md)
- [InlineEmailInputAnyOf1](docs/InlineEmailInputAnyOf1.md)
- [ListEmailEvents200Response](docs/ListEmailEvents200Response.md)
- [MessageEvent](docs/MessageEvent.md)
- [MessageOutboundProvider](docs/MessageOutboundProvider.md)
- [OpenTrackingSettings](docs/OpenTrackingSettings.md)
- [OpenTrackingUpdateInput](docs/OpenTrackingUpdateInput.md)
- [OutboundProvider](docs/OutboundProvider.md)
- [OutboundProviderCapabilities](docs/OutboundProviderCapabilities.md)
- [OutboundProviderConnectionDetails](docs/OutboundProviderConnectionDetails.md)
- [OutboundProviderDomainOverrideInput](docs/OutboundProviderDomainOverrideInput.md)
- [OutboundProviderDomainSetting](docs/OutboundProviderDomainSetting.md)
- [OutboundProviderEventEnvelope](docs/OutboundProviderEventEnvelope.md)
- [OutboundProviderEventResult](docs/OutboundProviderEventResult.md)
- [OutboundProviderSettings](docs/OutboundProviderSettings.md)
- [OutboundProviderStatus](docs/OutboundProviderStatus.md)
- [OutboundProviderTestInput](docs/OutboundProviderTestInput.md)
- [OutboundProviderTestResult](docs/OutboundProviderTestResult.md)
- [OutboundProviderUpdateInput](docs/OutboundProviderUpdateInput.md)
- [QueuedEmail](docs/QueuedEmail.md)
- [RateLimitErrorEnvelope](docs/RateLimitErrorEnvelope.md)
- [RateLimitErrorEnvelopeError](docs/RateLimitErrorEnvelopeError.md)
- [RateLimitLane](docs/RateLimitLane.md)
- [RateLimitSettings](docs/RateLimitSettings.md)
- [RateLimitUpdateInput](docs/RateLimitUpdateInput.md)
- [ReceiveInboundEmailInput](docs/ReceiveInboundEmailInput.md)
- [ReceivedEmail](docs/ReceivedEmail.md)
- [ReceivedEmailAccepted](docs/ReceivedEmailAccepted.md)
- [ReceivedEmailDiscarded](docs/ReceivedEmailDiscarded.md)
- [Recipients](docs/Recipients.md)
- [SendEmailInput](docs/SendEmailInput.md)
- [StoredAttachment](docs/StoredAttachment.md)
- [Suppression](docs/Suppression.md)
- [SuppressionInput](docs/SuppressionInput.md)
- [SuppressionListEnvelope](docs/SuppressionListEnvelope.md)
- [SuppressionReason](docs/SuppressionReason.md)
- [SuppressionUpdateInput](docs/SuppressionUpdateInput.md)
- [Template](docs/Template.md)
- [TemplateEmailInput](docs/TemplateEmailInput.md)
- [TemplateInput](docs/TemplateInput.md)
- [TemplateListEnvelope](docs/TemplateListEnvelope.md)
- [TemplatePreview](docs/TemplatePreview.md)
- [TemplatePreviewInput](docs/TemplatePreviewInput.md)
- [ValidationIssue](docs/ValidationIssue.md)
- [WebhookConfigurationEnvelope](docs/WebhookConfigurationEnvelope.md)
- [WebhookConfigurationInput](docs/WebhookConfigurationInput.md)
- [WebhookConfiguredEndpoint](docs/WebhookConfiguredEndpoint.md)
- [WebhookEndpoint](docs/WebhookEndpoint.md)
- [WebhookEvent](docs/WebhookEvent.md)
- [WebhookEventData](docs/WebhookEventData.md)
- [WebhookReadEnvelope](docs/WebhookReadEnvelope.md)

### Authorization


Authentication schemes defined for the API:
<a id="bearerAuth"></a>
#### bearerAuth


- **Type**: HTTP Bearer Token authentication (pb_live_... or pb_test_...)

## About

This TypeScript SDK client supports the [Fetch API](https://fetch.spec.whatwg.org/)
and is automatically generated by the
[OpenAPI Generator](https://openapi-generator.tech) project:

- API version: `1.0.0`
- Package version: `1.0.0`
- Generator version: `7.24.0`
- Build package: `org.openapitools.codegen.languages.TypeScriptFetchClientCodegen`

The generated npm module supports the following:

- Environments
  * Node.js
  * Webpack
  * Browserify
- Language levels
  * ES5 - you must have a Promises/A+ library installed
  * ES6
- Module systems
  * CommonJS
  * ES6 module system


## Development

### Building

To build the TypeScript source code, you need to have Node.js and npm installed.
After cloning the repository, navigate to the project directory and run:

```bash
npm install
npm run build
```

### Publishing

Once you've built the package, you can publish it to npm:

```bash
npm publish
```

## License

[Proprietary]()
