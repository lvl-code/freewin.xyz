# Super API

`/en/api/super/*` is a machine-to-machine administrative API that lets
the central Lummet control plane manage this tenant deployment over
HTTPS. It is **separate** from:

- the normal `/en/api/*` API (browser/session auth via `auth.js`)
- the tenant's own AI assistant at `lummet.<tenant-host>` (unrelated
  `en/worker/lummet/` module — do not confuse the two)

No tenant content database is shared. This API is the *only* channel
between Lummet and a tenant; Lummet never queries this tenant's D1
directly.

## Authentication

Every request must be signed with HMAC-SHA256 using a shared secret
configured only as Worker secrets on this tenant:

```
wrangler secret put SUPER_API_CREDENTIAL_ID
wrangler secret put SUPER_API_SECRET
```

Required headers:

| Header | Description |
|---|---|
| `Authorization` | `Bearer <credential_id>` |
| `X-Lummet-Timestamp` | Unix time in milliseconds |
| `X-Lummet-Nonce` | Random hex string, unique per request |
| `X-Lummet-Signature` | Hex HMAC-SHA256 signature (see below) |

**Canonical string to sign** (newline-joined):

```
{METHOD}
{PATH}
{TIMESTAMP}
{NONCE}
{SHA256_HEX(BODY)}
```

- `METHOD` — uppercase HTTP method
- `PATH` — request path, e.g. `/en/api/super/news`
- `TIMESTAMP` / `NONCE` — same values sent in the headers
- `SHA256_HEX(BODY)` — hex SHA-256 of the raw request body
  (`SHA256_HEX("")` for bodyless requests)

Sign the canonical string with `SUPER_API_SECRET` (HMAC-SHA256, hex
output) and send it as `X-Lummet-Signature`.

### Verification steps (tenant side)

1. `credential_id` must exactly match `env.SUPER_API_CREDENTIAL_ID`.
2. `timestamp` must be within 5 minutes of the server's clock.
3. Signature must match the recomputed HMAC (constant-time compare).
4. `(credential_id, nonce)` must not have been seen before (replay
   protection — nonces are recorded in `super_api_nonces`).
5. Requests are rate-limited per `credential_id`
   (`super_api_rate_limits`, 120 requests/minute).

Any failure returns a generic `401` (or `429` for rate limiting) and
is recorded in `super_audit_logs`. The specific failure reason is
never revealed in the response body.

The `Host` header is **never** used for authorization — see rule #10
in the master architecture plan. Hostname only affects tenant-side
rendering, never Super API access control.

## Handshake / health / capabilities

```
GET /en/api/super/handshake
GET /en/api/super/health
GET /en/api/super/capabilities
```

`handshake` returns safe deployment metadata (host, site name,
deployment id, API version, capability list) — never secrets or
credential material.

## Resources

Each resource below follows the same REST shape:

```
GET    /en/api/super/<resource>
GET    /en/api/super/<resource>/:id
POST   /en/api/super/<resource>
PUT    /en/api/super/<resource>/:id
DELETE /en/api/super/<resource>/:id
```

Supported resources: `casinos`, `reviews`, `news`, `pages`,
`categories`, `countries`, `authors`, `media` (metadata only, plus
`POST /media/upload` — base64-JSON image upload), `settings` (safe
config keys only), `users` (list/read/role-update/delete),
`components`, `blocks` (page_components — component placements on
pages), `permissions` (role/resource/action matrix), `nav-items`,
`banners`.

All handlers call the tenant's existing `worker/database/*.js`
functions directly — no parallel business logic exists, except
where the tenant's own `en/worker/api.js` performs required-field
validation before calling the database layer (casinos, reviews,
pages) — that same validation is now replicated in the Super API
handlers so it rejects invalid input exactly like the tenant's own
admin does, rather than silently accepting an incomplete record.
There is **no arbitrary SQL endpoint** and no raw query passthrough.

## Settings safety

`GET/PUT /en/api/super/settings` filters out any key matching
`secret|password|credential|private_key|api_key|token` (case
insensitive). Sensitive secrets are never readable or writable
through this API.

## Errors

| Status | Meaning |
|---|---|
| 401 | Missing/invalid/expired/replayed credentials |
| 404 | Unknown route or resource not found |
| 422 | Validation error |
| 429 | Rate limited |
| 500 | Internal error (tenant-side) |
| 503 | Tenant not configured for Super API |

## Audit logging

Every request — successful or not — is recorded in
`super_audit_logs` (endpoint, method, resource, resource id, action,
success, status code, request id, timestamp). Credentials and
secrets are never logged.

## Versioning

`api_version` in the handshake/capabilities response is currently
`1`. The control plane should check this and adjust its feature set
per tenant rather than assuming every deployment runs the same code
version.

## Adding a new resource

1. Add thin wrapper functions to `en/worker/super/handlers.js` that
   call the existing `database/*.js` module for that resource — do
   not write new business logic.
2. Add the route entries to the `ROUTES` allowlist in
   `en/worker/super/router.js`.
3. Add the capability flag to `en/worker/super/capabilities.js`.
4. Never add a route that accepts raw SQL or arbitrary queries.
