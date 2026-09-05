# paperboy/openapi

Tenant-bound transactional email API. API keys select one organization and one live or test environment. Stored instants and HTTP timestamps are RFC 3339 UTC. The queue is provider-neutral: self-hosted SMTP and Cloudflare Email Service and Amazon SES use the same messages, limits, suppressions, and event model. The signed-in console renders this contract at `/app/docs`. The Rust CLI in `crates/paperboy` calls the same bearer-key routes.


## Installation & Usage

### Requirements

PHP 8.1 and later.

### Composer

To install the bindings via [Composer](https://getcomposer.org/), add the following to `composer.json`:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/GIT_USER_ID/GIT_REPO_ID.git"
    }
  ],
  "require": {
    "GIT_USER_ID/GIT_REPO_ID": "*@dev"
  }
}
```

Then run `composer install`

### Manual Installation

Download the files and include `autoload.php`:

```php
<?php
require_once('/path/to/paperboy/openapi/vendor/autoload.php');
```

## Getting Started

Please follow the [installation procedure](#installation--usage) and then run the following:

```php
<?php
require_once(__DIR__ . '/vendor/autoload.php');



// Configure Bearer (pb_live_... or pb_test_...) authorization: bearerAuth
$config = PaperBoy\OpenApi\Configuration::getDefaultConfiguration()->setAccessToken('YOUR_ACCESS_TOKEN');


$apiInstance = new PaperBoy\OpenApi\Api\AudiencesApi(
    // If you want use custom http client, pass your client which implements `GuzzleHttp\ClientInterface`.
    // This is optional, `GuzzleHttp\Client` will be used as default.
    new GuzzleHttp\Client(),
    $config
);
$audience_input = new \PaperBoy\OpenApi\Model\AudienceInput(); // \PaperBoy\OpenApi\Model\AudienceInput

try {
    $result = $apiInstance->createAudience($audience_input);
    print_r($result);
} catch (Exception $e) {
    echo 'Exception when calling AudiencesApi->createAudience: ', $e->getMessage(), PHP_EOL;
}

```

## API Endpoints

All URIs are relative to *http://localhost*

Class | Method | HTTP request | Description
------------ | ------------- | ------------- | -------------
*AudiencesApi* | [**createAudience**](docs/Api/AudiencesApi.md#createaudience) | **POST** /api/v1/audiences | Create one audience
*AudiencesApi* | [**createContact**](docs/Api/AudiencesApi.md#createcontact) | **POST** /api/v1/audiences/{audienceId}/contacts | Add one contact
*AudiencesApi* | [**deleteAudience**](docs/Api/AudiencesApi.md#deleteaudience) | **DELETE** /api/v1/audiences/{audienceId} | Delete one audience
*AudiencesApi* | [**deleteContact**](docs/Api/AudiencesApi.md#deletecontact) | **DELETE** /api/v1/audiences/{audienceId}/contacts/{contactId} | Delete one contact
*AudiencesApi* | [**getAudience**](docs/Api/AudiencesApi.md#getaudience) | **GET** /api/v1/audiences/{audienceId} | Get one audience
*AudiencesApi* | [**getContact**](docs/Api/AudiencesApi.md#getcontact) | **GET** /api/v1/audiences/{audienceId}/contacts/{contactId} | Get one contact
*AudiencesApi* | [**importContacts**](docs/Api/AudiencesApi.md#importcontacts) | **POST** /api/v1/audiences/{audienceId}/contacts/import | Import contacts from CSV
*AudiencesApi* | [**listAudiences**](docs/Api/AudiencesApi.md#listaudiences) | **GET** /api/v1/audiences | List audiences
*AudiencesApi* | [**listContacts**](docs/Api/AudiencesApi.md#listcontacts) | **GET** /api/v1/audiences/{audienceId}/contacts | List audience contacts
*AudiencesApi* | [**updateAudience**](docs/Api/AudiencesApi.md#updateaudience) | **PATCH** /api/v1/audiences/{audienceId} | Rename one audience
*AudiencesApi* | [**updateContact**](docs/Api/AudiencesApi.md#updatecontact) | **PATCH** /api/v1/audiences/{audienceId}/contacts/{contactId} | Update one contact
*BroadcastsApi* | [**cancelBroadcast**](docs/Api/BroadcastsApi.md#cancelbroadcast) | **POST** /api/v1/broadcasts/{broadcastId}/cancel | Cancel a broadcast
*BroadcastsApi* | [**createBroadcast**](docs/Api/BroadcastsApi.md#createbroadcast) | **POST** /api/v1/broadcasts | Create one broadcast
*BroadcastsApi* | [**getBroadcast**](docs/Api/BroadcastsApi.md#getbroadcast) | **GET** /api/v1/broadcasts/{broadcastId} | Get one broadcast
*BroadcastsApi* | [**listBroadcasts**](docs/Api/BroadcastsApi.md#listbroadcasts) | **GET** /api/v1/broadcasts | List broadcasts
*BroadcastsApi* | [**pauseBroadcast**](docs/Api/BroadcastsApi.md#pausebroadcast) | **POST** /api/v1/broadcasts/{broadcastId}/pause | Pause a running broadcast
*BroadcastsApi* | [**resumeBroadcast**](docs/Api/BroadcastsApi.md#resumebroadcast) | **POST** /api/v1/broadcasts/{broadcastId}/resume | Resume a paused broadcast
*BroadcastsApi* | [**updateBroadcast**](docs/Api/BroadcastsApi.md#updatebroadcast) | **PATCH** /api/v1/broadcasts/{broadcastId} | Update a scheduled broadcast
*EmailsApi* | [**getEmail**](docs/Api/EmailsApi.md#getemail) | **GET** /api/v1/emails/{emailId} | Get one email
*EmailsApi* | [**getReceivedEmail**](docs/Api/EmailsApi.md#getreceivedemail) | **GET** /api/v1/received-emails/{emailId} | Get one inbound email
*EmailsApi* | [**receiveInboundEmail**](docs/Api/EmailsApi.md#receiveinboundemail) | **POST** /api/v1/received-emails | Store one inbound email
*EmailsApi* | [**sendEmail**](docs/Api/EmailsApi.md#sendemail) | **POST** /api/v1/emails | Queue one email
*EmailsApi* | [**sendEmailBatch**](docs/Api/EmailsApi.md#sendemailbatch) | **POST** /api/v1/emails/batch | Queue one to 100 emails
*EventsApi* | [**listEmailEvents**](docs/Api/EventsApi.md#listemailevents) | **GET** /api/v1/emails/{emailId}/events | List one email&#39;s events
*OpenTrackingApi* | [**getOpenTracking**](docs/Api/OpenTrackingApi.md#getopentracking) | **GET** /api/v1/open-tracking | Read organization open tracking
*OpenTrackingApi* | [**recordClick**](docs/Api/OpenTrackingApi.md#recordclick) | **GET** /c/{messageId}/{signature} | Follow a signed first-party click redirect
*OpenTrackingApi* | [**recordOpen**](docs/Api/OpenTrackingApi.md#recordopen) | **GET** /o/{messageId}/{signature}.gif | Fetch the signed first-party open pixel
*OpenTrackingApi* | [**updateOpenTracking**](docs/Api/OpenTrackingApi.md#updateopentracking) | **PATCH** /api/v1/open-tracking | Update organization open tracking
*OutboundProvidersApi* | [**getOutboundProviders**](docs/Api/OutboundProvidersApi.md#getoutboundproviders) | **GET** /api/v1/providers | Read outbound-provider routing
*OutboundProvidersApi* | [**ingestAwsSesEvent**](docs/Api/OutboundProvidersApi.md#ingestawssesevent) | **POST** /api/v1/providers/aws-ses/events | Ingest one Amazon SES event
*OutboundProvidersApi* | [**receiveAwsSesSnsEvent**](docs/Api/OutboundProvidersApi.md#receiveawssessnsevent) | **POST** /api/v1/providers/aws-ses/events/{orgId} | Receive one signed Amazon SNS notification
*OutboundProvidersApi* | [**testOutboundProvider**](docs/Api/OutboundProvidersApi.md#testoutboundprovider) | **POST** /api/v1/providers/test | Test one outbound provider
*OutboundProvidersApi* | [**updateOutboundProviders**](docs/Api/OutboundProvidersApi.md#updateoutboundproviders) | **PATCH** /api/v1/providers | Update outbound-provider routing
*RateLimitsApi* | [**getRateLimits**](docs/Api/RateLimitsApi.md#getratelimits) | **GET** /api/v1/rate-limits | Read organization send-rate limits
*RateLimitsApi* | [**updateRateLimits**](docs/Api/RateLimitsApi.md#updateratelimits) | **PATCH** /api/v1/rate-limits | Override organization send-rate limits
*SuppressionsApi* | [**createSuppression**](docs/Api/SuppressionsApi.md#createsuppression) | **POST** /api/v1/suppressions | Create one suppression
*SuppressionsApi* | [**deleteSuppression**](docs/Api/SuppressionsApi.md#deletesuppression) | **DELETE** /api/v1/suppressions/{suppressionId} | Delete one suppression
*SuppressionsApi* | [**getSuppression**](docs/Api/SuppressionsApi.md#getsuppression) | **GET** /api/v1/suppressions/{suppressionId} | Get one suppression
*SuppressionsApi* | [**importSuppressions**](docs/Api/SuppressionsApi.md#importsuppressions) | **POST** /api/v1/suppressions/import | Import suppressions from CSV
*SuppressionsApi* | [**listSuppressions**](docs/Api/SuppressionsApi.md#listsuppressions) | **GET** /api/v1/suppressions | List suppressions
*SuppressionsApi* | [**updateSuppression**](docs/Api/SuppressionsApi.md#updatesuppression) | **PATCH** /api/v1/suppressions/{suppressionId} | Update one suppression
*TemplatesApi* | [**createTemplate**](docs/Api/TemplatesApi.md#createtemplate) | **POST** /api/v1/templates | Create one template
*TemplatesApi* | [**deleteTemplate**](docs/Api/TemplatesApi.md#deletetemplate) | **DELETE** /api/v1/templates/{templateId} | Delete one template
*TemplatesApi* | [**getTemplate**](docs/Api/TemplatesApi.md#gettemplate) | **GET** /api/v1/templates/{templateId} | Get one template
*TemplatesApi* | [**listTemplates**](docs/Api/TemplatesApi.md#listtemplates) | **GET** /api/v1/templates | List templates
*TemplatesApi* | [**previewTemplate**](docs/Api/TemplatesApi.md#previewtemplate) | **POST** /api/v1/templates/{templateId}/preview | Render one template without sending
*TemplatesApi* | [**updateTemplate**](docs/Api/TemplatesApi.md#updatetemplate) | **PATCH** /api/v1/templates/{templateId} | Update one template
*WebhooksApi* | [**configureWebhook**](docs/Api/WebhooksApi.md#configurewebhook) | **PUT** /api/v1/webhooks | Configure webhook delivery
*WebhooksApi* | [**getWebhook**](docs/Api/WebhooksApi.md#getwebhook) | **GET** /api/v1/webhooks | Read webhook configuration

## Models

- [Audience](docs/Model/Audience.md)
- [AudienceInput](docs/Model/AudienceInput.md)
- [AudienceListEnvelope](docs/Model/AudienceListEnvelope.md)
- [AwsSnsEnvelope](docs/Model/AwsSnsEnvelope.md)
- [Broadcast](docs/Model/Broadcast.md)
- [BroadcastCreateInput](docs/Model/BroadcastCreateInput.md)
- [BroadcastEnvelope](docs/Model/BroadcastEnvelope.md)
- [BroadcastListEnvelope](docs/Model/BroadcastListEnvelope.md)
- [BroadcastProgress](docs/Model/BroadcastProgress.md)
- [BroadcastUpdateInput](docs/Model/BroadcastUpdateInput.md)
- [Contact](docs/Model/Contact.md)
- [ContactInput](docs/Model/ContactInput.md)
- [ContactListEnvelope](docs/Model/ContactListEnvelope.md)
- [DeletedResource](docs/Model/DeletedResource.md)
- [Email](docs/Model/Email.md)
- [EmailAttachment](docs/Model/EmailAttachment.md)
- [EmailBatchEnvelope](docs/Model/EmailBatchEnvelope.md)
- [EmailBatchItem](docs/Model/EmailBatchItem.md)
- [EmailTag](docs/Model/EmailTag.md)
- [ErrorEnvelope](docs/Model/ErrorEnvelope.md)
- [ErrorEnvelopeError](docs/Model/ErrorEnvelopeError.md)
- [InlineEmailInput](docs/Model/InlineEmailInput.md)
- [InlineEmailInputAnyOf](docs/Model/InlineEmailInputAnyOf.md)
- [InlineEmailInputAnyOf1](docs/Model/InlineEmailInputAnyOf1.md)
- [ListEmailEvents200Response](docs/Model/ListEmailEvents200Response.md)
- [MessageEvent](docs/Model/MessageEvent.md)
- [MessageOutboundProvider](docs/Model/MessageOutboundProvider.md)
- [OpenTrackingSettings](docs/Model/OpenTrackingSettings.md)
- [OpenTrackingUpdateInput](docs/Model/OpenTrackingUpdateInput.md)
- [OutboundProvider](docs/Model/OutboundProvider.md)
- [OutboundProviderCapabilities](docs/Model/OutboundProviderCapabilities.md)
- [OutboundProviderConnectionDetails](docs/Model/OutboundProviderConnectionDetails.md)
- [OutboundProviderDomainOverrideInput](docs/Model/OutboundProviderDomainOverrideInput.md)
- [OutboundProviderDomainSetting](docs/Model/OutboundProviderDomainSetting.md)
- [OutboundProviderEventEnvelope](docs/Model/OutboundProviderEventEnvelope.md)
- [OutboundProviderEventResult](docs/Model/OutboundProviderEventResult.md)
- [OutboundProviderSettings](docs/Model/OutboundProviderSettings.md)
- [OutboundProviderStatus](docs/Model/OutboundProviderStatus.md)
- [OutboundProviderTestInput](docs/Model/OutboundProviderTestInput.md)
- [OutboundProviderTestResult](docs/Model/OutboundProviderTestResult.md)
- [OutboundProviderUpdateInput](docs/Model/OutboundProviderUpdateInput.md)
- [QueuedEmail](docs/Model/QueuedEmail.md)
- [RateLimitErrorEnvelope](docs/Model/RateLimitErrorEnvelope.md)
- [RateLimitErrorEnvelopeError](docs/Model/RateLimitErrorEnvelopeError.md)
- [RateLimitLane](docs/Model/RateLimitLane.md)
- [RateLimitSettings](docs/Model/RateLimitSettings.md)
- [RateLimitUpdateInput](docs/Model/RateLimitUpdateInput.md)
- [ReceiveInboundEmailInput](docs/Model/ReceiveInboundEmailInput.md)
- [ReceivedEmail](docs/Model/ReceivedEmail.md)
- [ReceivedEmailAccepted](docs/Model/ReceivedEmailAccepted.md)
- [ReceivedEmailDiscarded](docs/Model/ReceivedEmailDiscarded.md)
- [Recipients](docs/Model/Recipients.md)
- [SendEmailInput](docs/Model/SendEmailInput.md)
- [StoredAttachment](docs/Model/StoredAttachment.md)
- [Suppression](docs/Model/Suppression.md)
- [SuppressionInput](docs/Model/SuppressionInput.md)
- [SuppressionListEnvelope](docs/Model/SuppressionListEnvelope.md)
- [SuppressionReason](docs/Model/SuppressionReason.md)
- [SuppressionUpdateInput](docs/Model/SuppressionUpdateInput.md)
- [Template](docs/Model/Template.md)
- [TemplateEmailInput](docs/Model/TemplateEmailInput.md)
- [TemplateInput](docs/Model/TemplateInput.md)
- [TemplateListEnvelope](docs/Model/TemplateListEnvelope.md)
- [TemplatePreview](docs/Model/TemplatePreview.md)
- [TemplatePreviewInput](docs/Model/TemplatePreviewInput.md)
- [ValidationIssue](docs/Model/ValidationIssue.md)
- [WebhookConfigurationEnvelope](docs/Model/WebhookConfigurationEnvelope.md)
- [WebhookConfigurationInput](docs/Model/WebhookConfigurationInput.md)
- [WebhookConfiguredEndpoint](docs/Model/WebhookConfiguredEndpoint.md)
- [WebhookEndpoint](docs/Model/WebhookEndpoint.md)
- [WebhookEvent](docs/Model/WebhookEvent.md)
- [WebhookEventData](docs/Model/WebhookEventData.md)
- [WebhookReadEnvelope](docs/Model/WebhookReadEnvelope.md)

## Authorization

Authentication schemes defined for the API:
### bearerAuth

- **Type**: Bearer authentication (pb_live_... or pb_test_...)

## Tests

To run the tests, use:

```bash
composer install
vendor/bin/phpunit
```

## Author



## About this package

This PHP package is automatically generated by the [OpenAPI Generator](https://openapi-generator.tech) project:

- API version: `1.0.0`
    - Generator version: `7.24.0`
- Build package: `org.openapitools.codegen.languages.PhpClientCodegen`
