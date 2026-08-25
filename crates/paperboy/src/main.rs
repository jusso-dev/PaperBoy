mod client;

use anyhow::{Context, Result};
use clap::{Args, Parser, Subcommand};
use client::{json_object, PaperBoyClient};
use reqwest::Method;
use serde_json::{json, Value};
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "paperboy",
    about = "Call the PaperBoy HTTP API with a bearer key.",
    long_about = "Tenant and environment come only from PAPERBOY_API_KEY. Protocol timestamps stay UTC."
)]
struct Cli {
    #[arg(long, env = "PAPERBOY_API_KEY")]
    api_key: String,
    #[arg(long, env = "PAPERBOY_BASE_URL")]
    base_url: String,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Queue and inspect emails.
    Email {
        #[command(subcommand)]
        command: EmailCommand,
    },
    /// Store and preview templates.
    Template {
        #[command(subcommand)]
        command: TemplateCommand,
    },
    /// Manage audiences.
    Audience {
        #[command(subcommand)]
        command: AudienceCommand,
    },
    /// Manage audience contacts.
    Contact {
        #[command(subcommand)]
        command: ContactCommand,
    },
    /// Create and control broadcasts.
    Broadcast {
        #[command(subcommand)]
        command: BroadcastCommand,
    },
    /// Manage suppressions.
    Suppression {
        #[command(subcommand)]
        command: SuppressionCommand,
    },
    /// Read or configure the signed webhook.
    Webhook {
        #[command(subcommand)]
        command: WebhookCommand,
    },
    /// Inspect and update outbound providers.
    Provider {
        #[command(subcommand)]
        command: ProviderCommand,
    },
    /// Read or override organization send-rate limits.
    RateLimits {
        #[command(subcommand)]
        command: RateLimitCommand,
    },
    /// Read or update open tracking.
    OpenTracking {
        #[command(subcommand)]
        command: OpenTrackingCommand,
    },
    /// Call any documented route.
    Api(ApiArgs),
}

#[derive(Subcommand)]
enum EmailCommand {
    Send(EmailSendArgs),
    Get { id: String },
    Events { id: String },
    Batch { file: PathBuf },
}

#[derive(Args)]
struct EmailSendArgs {
    #[arg(long)]
    data: Option<String>,
    #[arg(long)]
    from: String,
    #[arg(long)]
    html: Option<String>,
    #[arg(long)]
    html_file: Option<PathBuf>,
    #[arg(long)]
    idempotency_key: Option<String>,
    #[arg(long)]
    subject: Option<String>,
    #[arg(long)]
    template_id: Option<String>,
    #[arg(long)]
    text: Option<String>,
    #[arg(long, required = true)]
    to: Vec<String>,
}

#[derive(Subcommand)]
enum TemplateCommand {
    List,
    Get { id: String },
    Create(TemplateWriteArgs),
    Update {
        id: String,
        #[command(flatten)]
        args: TemplateWriteArgs,
    },
    Delete { id: String },
    Preview {
        id: String,
        #[arg(long, default_value = "{}")]
        data: String,
    },
}

#[derive(Args)]
struct TemplateWriteArgs {
    #[arg(long)]
    html: Option<String>,
    #[arg(long)]
    html_file: Option<PathBuf>,
    #[arg(long)]
    name: Option<String>,
    #[arg(long)]
    required_variables: Vec<String>,
    #[arg(long)]
    subject: Option<String>,
    #[arg(long)]
    text: Option<String>,
}

#[derive(Subcommand)]
enum AudienceCommand {
    List,
    Get { id: String },
    Create { name: String },
    Update { id: String, name: String },
    Delete { id: String },
}

#[derive(Subcommand)]
enum ContactCommand {
    List { audience_id: String },
    Get {
        audience_id: String,
        contact_id: String,
    },
    Add {
        audience_id: String,
        email: String,
        #[arg(long)]
        name: Option<String>,
    },
    Update {
        audience_id: String,
        contact_id: String,
        #[arg(long)]
        email: Option<String>,
        #[arg(long)]
        name: Option<String>,
    },
    Delete {
        audience_id: String,
        contact_id: String,
    },
    Import {
        audience_id: String,
        file: PathBuf,
    },
}

#[derive(Subcommand)]
enum BroadcastCommand {
    List,
    Get { id: String },
    Create(BroadcastCreateArgs),
    Update {
        id: String,
        #[command(flatten)]
        args: BroadcastUpdateArgs,
    },
    Pause { id: String },
    Resume { id: String },
    Cancel { id: String },
}

#[derive(Args)]
struct BroadcastCreateArgs {
    #[arg(long)]
    audience_id: String,
    #[arg(long)]
    from: String,
    #[arg(long)]
    name: String,
    #[arg(long)]
    scheduled_for: Option<String>,
    #[arg(long)]
    template_id: String,
}

#[derive(Args)]
struct BroadcastUpdateArgs {
    #[arg(long)]
    audience_id: Option<String>,
    #[arg(long)]
    from: Option<String>,
    #[arg(long)]
    html: Option<String>,
    #[arg(long)]
    html_file: Option<PathBuf>,
    #[arg(long)]
    name: Option<String>,
    #[arg(long)]
    scheduled_for: Option<String>,
    #[arg(long)]
    subject: Option<String>,
    #[arg(long)]
    template_id: Option<String>,
}

#[derive(Subcommand)]
enum SuppressionCommand {
    List {
        #[arg(long)]
        limit: Option<u32>,
        #[arg(long)]
        query: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    Get { id: String },
    Create {
        email: String,
        reason: String,
    },
    Update {
        id: String,
        #[arg(long)]
        email: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    Delete { id: String },
    Import { file: PathBuf },
}

#[derive(Subcommand)]
enum WebhookCommand {
    Get,
    Configure { url: String },
}

#[derive(Subcommand)]
enum ProviderCommand {
    Get,
    Update { body: String },
    Test { provider: String },
}

#[derive(Subcommand)]
enum RateLimitCommand {
    Get,
    Update {
        #[arg(long)]
        live: Option<String>,
        #[arg(long)]
        test: Option<String>,
    },
}

#[derive(Subcommand)]
enum OpenTrackingCommand {
    Get,
    Update { enabled: bool },
}

#[derive(Args)]
struct ApiArgs {
    method: String,
    path: String,
    #[arg(long)]
    body: Option<String>,
    #[arg(long)]
    body_file: Option<PathBuf>,
    #[arg(long, default_value = "application/json")]
    content_type: String,
    #[arg(long)]
    idempotency_key: Option<String>,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let client = PaperBoyClient::new(&cli.base_url, &cli.api_key)?;
    print_json(&dispatch(&client, cli.command)?)
}

fn dispatch(client: &PaperBoyClient, command: Command) -> Result<Value> {
    match command {
        Command::Email { command } => email(client, command),
        Command::Template { command } => template(client, command),
        Command::Audience { command } => audience(client, command),
        Command::Contact { command } => contact(client, command),
        Command::Broadcast { command } => broadcast(client, command),
        Command::Suppression { command } => suppression(client, command),
        Command::Webhook { command } => webhook(client, command),
        Command::Provider { command } => provider(client, command),
        Command::RateLimits { command } => rate_limits(client, command),
        Command::OpenTracking { command } => open_tracking(client, command),
        Command::Api(args) => api(client, args),
    }
}

fn email(client: &PaperBoyClient, command: EmailCommand) -> Result<Value> {
    match command {
        EmailCommand::Send(args) => {
            let html = optional_file_or_text(args.html, args.html_file)?;
            let to = if args.to.len() == 1 {
                json!(args.to[0])
            } else {
                json!(args.to)
            };
            let body = if let Some(template_id) = args.template_id {
                json_object(vec![
                    ("from", Some(json!(args.from))),
                    ("to", Some(to)),
                    ("template_id", Some(json!(template_id))),
                    ("data", optional_json(args.data)?),
                ])
            } else {
                json_object(vec![
                    ("from", Some(json!(args.from))),
                    ("to", Some(to)),
                    ("subject", args.subject.map(|value| json!(value))),
                    ("html", html.map(|value| json!(value))),
                    ("text", args.text.map(|value| json!(value))),
                ])
            };
            client.send_email(&body, args.idempotency_key.as_deref())
        }
        EmailCommand::Get { id } => client.get(&format!("/api/v1/emails/{id}")),
        EmailCommand::Events { id } => client.get(&format!("/api/v1/emails/{id}/events")),
        EmailCommand::Batch { file } => client.send_json(
            Method::POST,
            "/api/v1/emails/batch",
            &read_json_file(&file)?,
        ),
    }
}

fn template(client: &PaperBoyClient, command: TemplateCommand) -> Result<Value> {
    match command {
        TemplateCommand::List => client.get("/api/v1/templates"),
        TemplateCommand::Get { id } => client.get(&format!("/api/v1/templates/{id}")),
        TemplateCommand::Create(args) => client.send_json(
            Method::POST,
            "/api/v1/templates",
            &template_body(args)?,
        ),
        TemplateCommand::Update { id, args } => client.send_json(
            Method::PATCH,
            &format!("/api/v1/templates/{id}"),
            &template_body(args)?,
        ),
        TemplateCommand::Delete { id } => {
            client.exchange(Method::DELETE, &format!("/api/v1/templates/{id}"), None, None, "application/json")
        }
        TemplateCommand::Preview { id, data } => client.send_json(
            Method::POST,
            &format!("/api/v1/templates/{id}/preview"),
            &json!({ "data": parse_json(&data, "--data")? }),
        ),
    }
}

fn template_body(args: TemplateWriteArgs) -> Result<Value> {
    let html = optional_file_or_text(args.html, args.html_file)?;
    Ok(json_object(vec![
        ("name", args.name.map(|value| json!(value))),
        ("subject", args.subject.map(|value| json!(value))),
        ("html", html.map(|value| json!(value))),
        ("text", args.text.map(|value| json!(value))),
        (
            "required_variables",
            if args.required_variables.is_empty() {
                None
            } else {
                Some(json!(args.required_variables))
            },
        ),
    ]))
}

fn audience(client: &PaperBoyClient, command: AudienceCommand) -> Result<Value> {
    match command {
        AudienceCommand::List => client.get("/api/v1/audiences"),
        AudienceCommand::Get { id } => client.get(&format!("/api/v1/audiences/{id}")),
        AudienceCommand::Create { name } => {
            client.send_json(Method::POST, "/api/v1/audiences", &json!({ "name": name }))
        }
        AudienceCommand::Update { id, name } => client.send_json(
            Method::PATCH,
            &format!("/api/v1/audiences/{id}"),
            &json!({ "name": name }),
        ),
        AudienceCommand::Delete { id } => {
            client.exchange(Method::DELETE, &format!("/api/v1/audiences/{id}"), None, None, "application/json")
        }
    }
}

fn contact(client: &PaperBoyClient, command: ContactCommand) -> Result<Value> {
    match command {
        ContactCommand::List { audience_id } => {
            client.get(&format!("/api/v1/audiences/{audience_id}/contacts"))
        }
        ContactCommand::Get {
            audience_id,
            contact_id,
        } => client.get(&format!(
            "/api/v1/audiences/{audience_id}/contacts/{contact_id}"
        )),
        ContactCommand::Add {
            audience_id,
            email,
            name,
        } => client.send_json(
            Method::POST,
            &format!("/api/v1/audiences/{audience_id}/contacts"),
            &json_object(vec![
                ("email", Some(json!(email))),
                ("name", name.map(|value| json!(value))),
            ]),
        ),
        ContactCommand::Update {
            audience_id,
            contact_id,
            email,
            name,
        } => client.send_json(
            Method::PATCH,
            &format!("/api/v1/audiences/{audience_id}/contacts/{contact_id}"),
            &json_object(vec![
                ("email", email.map(|value| json!(value))),
                ("name", name.map(|value| json!(value))),
            ]),
        ),
        ContactCommand::Delete {
            audience_id,
            contact_id,
        } => client.exchange(
            Method::DELETE,
            &format!("/api/v1/audiences/{audience_id}/contacts/{contact_id}"),
            None,
            None,
            "application/json",
        ),
        ContactCommand::Import { audience_id, file } => client.send_text(
            Method::POST,
            &format!("/api/v1/audiences/{audience_id}/contacts/import"),
            fs::read_to_string(&file).with_context(|| format!("Could not read {}", file.display()))?,
            "text/csv",
        ),
    }
}

fn broadcast(client: &PaperBoyClient, command: BroadcastCommand) -> Result<Value> {
    match command {
        BroadcastCommand::List => client.get("/api/v1/broadcasts"),
        BroadcastCommand::Get { id } => client.get(&format!("/api/v1/broadcasts/{id}")),
        BroadcastCommand::Create(args) => client.send_json(
            Method::POST,
            "/api/v1/broadcasts",
            &json_object(vec![
                ("audience_id", Some(json!(args.audience_id))),
                ("from", Some(json!(args.from))),
                ("name", Some(json!(args.name))),
                ("template_id", Some(json!(args.template_id))),
                ("scheduled_for", args.scheduled_for.map(|value| json!(value))),
            ]),
        ),
        BroadcastCommand::Update { id, args } => {
            let html = optional_file_or_text(args.html, args.html_file)?;
            client.send_json(
                Method::PATCH,
                &format!("/api/v1/broadcasts/{id}"),
                &json_object(vec![
                    ("audience_id", args.audience_id.map(|value| json!(value))),
                    ("from", args.from.map(|value| json!(value))),
                    ("html", html.map(|value| json!(value))),
                    ("name", args.name.map(|value| json!(value))),
                    ("scheduled_for", args.scheduled_for.map(|value| json!(value))),
                    ("subject", args.subject.map(|value| json!(value))),
                    ("template_id", args.template_id.map(|value| json!(value))),
                ]),
            )
        }
        BroadcastCommand::Pause { id } => client.send_json(
            Method::POST,
            &format!("/api/v1/broadcasts/{id}/pause"),
            &json!({}),
        ),
        BroadcastCommand::Resume { id } => client.send_json(
            Method::POST,
            &format!("/api/v1/broadcasts/{id}/resume"),
            &json!({}),
        ),
        BroadcastCommand::Cancel { id } => client.send_json(
            Method::POST,
            &format!("/api/v1/broadcasts/{id}/cancel"),
            &json!({}),
        ),
    }
}

fn suppression(client: &PaperBoyClient, command: SuppressionCommand) -> Result<Value> {
    match command {
        SuppressionCommand::List {
            limit,
            query,
            reason,
        } => {
            let mut path = "/api/v1/suppressions".to_string();
            let mut parts = Vec::new();
            if let Some(query) = query {
                parts.push(format!("query={}", encode_query(&query)));
            }
            if let Some(reason) = reason {
                parts.push(format!("reason={}", encode_query(&reason)));
            }
            if let Some(limit) = limit {
                parts.push(format!("limit={limit}"));
            }
            if !parts.is_empty() {
                path.push('?');
                path.push_str(&parts.join("&"));
            }
            client.get(&path)
        }
        SuppressionCommand::Get { id } => client.get(&format!("/api/v1/suppressions/{id}")),
        SuppressionCommand::Create { email, reason } => client.send_json(
            Method::POST,
            "/api/v1/suppressions",
            &json!({ "email": email, "reason": reason }),
        ),
        SuppressionCommand::Update { id, email, reason } => client.send_json(
            Method::PATCH,
            &format!("/api/v1/suppressions/{id}"),
            &json_object(vec![
                ("email", email.map(|value| json!(value))),
                ("reason", reason.map(|value| json!(value))),
            ]),
        ),
        SuppressionCommand::Delete { id } => {
            client.exchange(Method::DELETE, &format!("/api/v1/suppressions/{id}"), None, None, "application/json")
        }
        SuppressionCommand::Import { file } => client.send_text(
            Method::POST,
            "/api/v1/suppressions/import",
            fs::read_to_string(&file).with_context(|| format!("Could not read {}", file.display()))?,
            "text/csv",
        ),
    }
}

fn webhook(client: &PaperBoyClient, command: WebhookCommand) -> Result<Value> {
    match command {
        WebhookCommand::Get => client.get("/api/v1/webhooks"),
        WebhookCommand::Configure { url } => {
            client.send_json(Method::PUT, "/api/v1/webhooks", &json!({ "url": url }))
        }
    }
}

fn provider(client: &PaperBoyClient, command: ProviderCommand) -> Result<Value> {
    match command {
        ProviderCommand::Get => client.get("/api/v1/providers"),
        ProviderCommand::Update { body } => {
            client.send_json(Method::PATCH, "/api/v1/providers", &parse_json(&body, "--body")?)
        }
        ProviderCommand::Test { provider } => client.send_json(
            Method::POST,
            "/api/v1/providers/test",
            &json!({ "provider": provider }),
        ),
    }
}

fn rate_limits(client: &PaperBoyClient, command: RateLimitCommand) -> Result<Value> {
    match command {
        RateLimitCommand::Get => client.get("/api/v1/rate-limits"),
        RateLimitCommand::Update { live, test } => client.send_json(
            Method::PATCH,
            "/api/v1/rate-limits",
            &json_object(vec![
                ("live_limit_per_minute", optional_limit(live)?),
                ("test_limit_per_minute", optional_limit(test)?),
            ]),
        ),
    }
}

fn open_tracking(client: &PaperBoyClient, command: OpenTrackingCommand) -> Result<Value> {
    match command {
        OpenTrackingCommand::Get => client.get("/api/v1/open-tracking"),
        OpenTrackingCommand::Update { enabled } => client.send_json(
            Method::PATCH,
            "/api/v1/open-tracking",
            &json!({ "enabled": enabled }),
        ),
    }
}

fn api(client: &PaperBoyClient, args: ApiArgs) -> Result<Value> {
    let method = args
        .method
        .parse::<Method>()
        .with_context(|| format!("Unsupported HTTP method {}", args.method))?;
    let body = match (args.body, args.body_file) {
        (Some(body), None) => Some(body),
        (None, Some(path)) => {
            Some(fs::read_to_string(&path).with_context(|| format!("Could not read {}", path.display()))?)
        }
        (None, None) => None,
        (Some(_), Some(_)) => anyhow::bail!("Use either --body or --body-file"),
    };
    client.exchange(
        method,
        &args.path,
        body,
        args.idempotency_key.as_deref(),
        &args.content_type,
    )
}

fn optional_file_or_text(
    text: Option<String>,
    file: Option<PathBuf>,
) -> Result<Option<String>> {
    match (text, file) {
        (Some(text), None) => Ok(Some(text)),
        (None, Some(path)) => Ok(Some(
            fs::read_to_string(&path).with_context(|| format!("Could not read {}", path.display()))?,
        )),
        (None, None) => Ok(None),
        (Some(_), Some(_)) => anyhow::bail!("Use either an inline HTML flag or --html-file"),
    }
}

fn optional_json(value: Option<String>) -> Result<Option<Value>> {
    value.map(|value| parse_json(&value, "--data")).transpose()
}

fn optional_limit(value: Option<String>) -> Result<Option<Value>> {
    match value.as_deref() {
        None => Ok(None),
        Some("null") => Ok(Some(Value::Null)),
        Some(raw) => Ok(Some(json!(raw
            .parse::<u32>()
            .context("Rate-limit overrides must be a whole number or null")?))),
    }
}

fn parse_json(value: &str, flag: &str) -> Result<Value> {
    serde_json::from_str(value).with_context(|| format!("{flag} must be valid JSON"))
}

fn read_json_file(path: &PathBuf) -> Result<Value> {
    parse_json(
        &fs::read_to_string(path).with_context(|| format!("Could not read {}", path.display()))?,
        "file",
    )
}

fn encode_query(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn print_json(value: &Value) -> Result<()> {
    writeln!(io::stdout(), "{}", serde_json::to_string_pretty(value)?)?;
    Ok(())
}
