# Product

## Register

product

## Users

Developers and infrastructure operators running their own transactional email stack. They need to configure delivery, inspect failures, and send mail without surrendering control of their MTA or learning an unfamiliar API.

## Product Purpose

PaperBoy provides a familiar, Resend-shaped control plane for self-hosted transactional email: API keys, sending domains, templates, message events, webhooks, and a first-class MCP server for agent-operated workflows. Success means operators can understand system state quickly, complete routine delivery work confidently, and retain ownership of infrastructure and data.

## Brand Personality

Tactile, candid, capable. PaperBoy should feel approachable and human while remaining dependable enough for production operations.

## Anti-references

Dark SaaS chrome, generic Tailwind zinc dashboards, marketing-ESP campaign builders, decorative emoji icon systems, and interfaces that conceal delivery mechanics behind vendor language.

## Design Principles

- Put operational state and next actions before decoration.
- Use familiar controls so flavour never slows the task.
- Let the paper-and-ink identity add warmth without reducing density or clarity.
- Explain delivery mechanics plainly and preserve operator control.
- Keep copy concise, direct, and in Australian English.
- Persist each user’s IANA timezone and use it for every console, log, and scheduling display. Keep stored instants and public protocol timestamps explicitly UTC.
- Treat HTTP, console, and MCP as peer interfaces over the same tenant-safe domain services and authorization rules.
- Treat self-hosted SMTP, AWS SES, Azure Email, and Cloudflare Email as first-class transport choices. Respect provider-managed authentication and never double-sign mail.

## Accessibility & Inclusion

Meet WCAG AA contrast for text and controls. Preserve visible keyboard focus, never communicate state through colour alone, respect reduced-motion preferences, and keep layouts usable at narrow widths and high zoom.
