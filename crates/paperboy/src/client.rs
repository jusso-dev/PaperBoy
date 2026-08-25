use anyhow::{anyhow, Context, Result};
use reqwest::blocking::Client as HttpClient;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use reqwest::Method;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Debug)]
pub struct PaperBoyClient {
    api_key: String,
    base_url: String,
    http: HttpClient,
}

impl PaperBoyClient {
    pub fn new(base_url: &str, api_key: &str) -> Result<Self> {
        Ok(Self {
            api_key: require_secret(api_key, "PAPERBOY_API_KEY")?,
            base_url: endpoint_base(base_url)?,
            http: HttpClient::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .context("Could not build the PaperBoy HTTP client")?,
        })
    }

    pub fn get(&self, path: &str) -> Result<Value> {
        self.exchange(Method::GET, path, None, None, "application/json")
    }

    pub fn send_json(&self, method: Method, path: &str, body: &Value) -> Result<Value> {
        self.exchange(
            method,
            path,
            Some(body.to_string()),
            None,
            "application/json",
        )
    }

    pub fn send_text(
        &self,
        method: Method,
        path: &str,
        body: String,
        content_type: &str,
    ) -> Result<Value> {
        self.exchange(method, path, Some(body), None, content_type)
    }

    pub fn send_email(&self, body: &Value, idempotency_key: Option<&str>) -> Result<Value> {
        self.exchange(
            Method::POST,
            "/api/v1/emails",
            Some(body.to_string()),
            idempotency_key,
            "application/json",
        )
    }

    pub fn exchange(
        &self,
        method: Method,
        path: &str,
        body: Option<String>,
        idempotency_key: Option<&str>,
        content_type: &str,
    ) -> Result<Value> {
        let url = self.url(path)?;
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.api_key))
                .context("PaperBoy API key is not a valid HTTP header value")?,
        );
        if body.is_some() {
            headers.insert(
                CONTENT_TYPE,
                HeaderValue::from_str(content_type).context("Invalid Content-Type")?,
            );
        }
        if let Some(key) = idempotency_key {
            headers.insert(
                "Idempotency-Key",
                HeaderValue::from_str(key).context("Idempotency key is not a valid HTTP header")?,
            );
        }

        let mut request = self.http.request(method, url).headers(headers);
        if let Some(body) = body {
            request = request.body(body);
        }

        let response = request
            .send()
            .context("PaperBoy could not be reached")?;
        let status = response.status();
        let text = response.text().unwrap_or_default();
        let parsed = if text.is_empty() {
            json!({ "ok": status.is_success(), "status": status.as_u16() })
        } else {
            serde_json::from_str(&text).unwrap_or_else(|_| json!({ "raw": text }))
        };

        if !status.is_success() {
            return Err(anyhow!(
                "PaperBoy returned HTTP {status}: {}",
                serde_json::to_string_pretty(&parsed).unwrap_or(text)
            ));
        }

        Ok(parsed)
    }

    fn url(&self, path: &str) -> Result<reqwest::Url> {
        self.base_url
            .parse::<reqwest::Url>()
            .context("PaperBoy base URL is invalid")?
            .join(path.trim_start_matches('/'))
            .context("PaperBoy path is invalid")
    }
}

pub fn endpoint_base(value: &str) -> Result<String> {
    let url = reqwest::Url::parse(value).context("PAPERBOY_BASE_URL must be an absolute HTTP(S) URL")?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(anyhow!("PAPERBOY_BASE_URL must be HTTP or HTTPS"));
    }
    if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some()
    {
        return Err(anyhow!(
            "PAPERBOY_BASE_URL must not include credentials, query, or fragment"
        ));
    }
    let mut rendered = url.to_string();
    if !rendered.ends_with('/') {
        rendered.push('/');
    }
    Ok(rendered)
}

fn require_secret(value: &str, name: &str) -> Result<String> {
    if value.is_empty() || value != value.trim() {
        return Err(anyhow!("{name} must be a non-empty unpadded secret"));
    }
    Ok(value.to_string())
}

pub fn json_object(pairs: Vec<(&str, Option<Value>)>) -> Value {
    let mut map = serde_json::Map::new();
    for (key, value) in pairs {
        if let Some(value) = value {
            map.insert(key.to_string(), value);
        }
    }
    Value::Object(map)
}

#[cfg(test)]
mod tests {
    use super::{endpoint_base, json_object, require_secret};
    use serde_json::json;

    #[test]
    fn endpoint_base_rejects_credentials_and_normalizes_slash() {
        assert_eq!(
            endpoint_base("https://paperboy.example").unwrap(),
            "https://paperboy.example/"
        );
        assert!(endpoint_base("https://user:secret@paperboy.example").is_err());
        assert!(endpoint_base("file:///tmp").is_err());
    }

    #[test]
    fn api_key_must_be_unpadded() {
        assert!(require_secret(" pb_test_x", "PAPERBOY_API_KEY").is_err());
        assert_eq!(
            require_secret("pb_test_x", "PAPERBOY_API_KEY").unwrap(),
            "pb_test_x"
        );
    }

    #[test]
    fn json_object_omits_absent_fields() {
        assert_eq!(
            json_object(vec![
                ("name", Some(json!("Morning edition"))),
                ("html", None),
            ]),
            json!({"name": "Morning edition"})
        );
    }
}
