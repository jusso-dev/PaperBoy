# Generated PaperBoy SDKs

These clients are generated from [`openapi.yaml`](../openapi.yaml) with OpenAPI Generator 7.24.0. Do not edit them by hand.

| Language | Package | Path |
| --- | --- | --- |
| TypeScript | `@paperboy/openapi` | [`typescript/`](typescript/) |
| PHP | `paperboy/openapi` | [`php/`](php/) |

The small handwritten [`@paperboy/sdk`](../packages/sdk) remains the `send()` / `get(id)` client. These packages cover the rest of the HTTP surface.

Regenerate locally (Java 17+):

```sh
bun run sdk:generate
```

Pushing a change to `openapi.yaml` runs [`.github/workflows/sdk.yml`](../.github/workflows/sdk.yml), which regenerates both trees and commits them back to the same branch.

Pass `Configuration.basePath` / `setHost` as the PaperBoy origin. Authentication is the same bearer API key as REST and the CLI.
