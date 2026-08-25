# PaperBoy CLI

`crates/paperboy` is a small Rust client for the bearer-key HTTP API. Tenant and
environment come only from the API key. Printed timestamps stay RFC 3339 UTC.

## Build

```sh
cargo build --release -p paperboy
```

The binary is `target/release/paperboy`. Keep the API key in the process
environment, never in a repository, URL, or command history if that can be
avoided.

```sh
export PAPERBOY_BASE_URL=https://paperboy.example
export PAPERBOY_API_KEY=pb_test_...
```

`--base-url` and `--api-key` override the environment for one invocation.

## Common commands

```sh
paperboy email send \
  --from 'PaperBoy <news@mail.example.com>' \
  --to reader@example.net \
  --subject 'Morning edition' \
  --text 'Hello'

paperboy email get 00000000-0000-4000-8000-000000000000
paperboy email events 00000000-0000-4000-8000-000000000000

paperboy template list
paperboy template preview "$TEMPLATE_ID" --data '{"reader":{"name":"Ada"}}'

paperboy audience list
paperboy contact add "$AUDIENCE_ID" reader@example.net --name Ada

paperboy broadcast create \
  --name 'Morning edition' \
  --from 'Newsroom <news@example.com>' \
  --template-id "$TEMPLATE_ID" \
  --audience-id "$AUDIENCE_ID"

paperboy broadcast update "$BROADCAST_ID" --html-file letter.html
paperboy suppression list --reason bounced
```

Any documented route can be called directly:

```sh
paperboy api GET /api/v1/rate-limits
paperboy api PATCH /api/v1/broadcasts/$BROADCAST_ID --body-file update.json
```

The signed-in console renders the same contract at `/app/docs`. The machine
document is `/openapi.yaml`.
