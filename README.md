# level.casino

Cloudflare Worker-based casino platform.

## Architecture

Application code lives under `en/`.

## Deployment

Deployment is handled through GitHub Actions and Cloudflare Wrangler.

## Structure

- `en/worker/` — Worker application
- `en/templates/` — rendering/templates
- `en/static/` — frontend assets
- `en/migrations/` — D1 migrations
- `en/lummet/` — Lummet AI
- `en/schema.sql` — database schema
- `wrangler.jsonc` — Cloudflare configuration
