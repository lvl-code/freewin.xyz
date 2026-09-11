# Conversion Postback & Import API

This covers the affiliate conversion ingestion surface: the universal
S2S postback endpoint, CSV/JSON imports, the outbound provider adapter
framework, and how they all feed the same attribution/commission/
reconciliation pipeline. It does **not** cover the general `/en/api/v1/*`
CRUD (affiliate partners/programs/offers/etc.) — see the admin dashboard
pages for those.

## Overview

```
Visitor → tracking link → click (click_id generated)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                      │
   Live postback         CSV/JSON import       Scheduled API sync
  (network → us,        (you → us, one-off)   (us → network, on a
   real time)                                   schedule)
        │                     │                      │
        └─────────── same normalize/attribute/commission/dedup ──────────┘
                              │
                    analytics_conversions
                    (source: postback | manual | import)
                              │
                    Reconciliation report
              (source IN (postback,manual) vs source=import)
```

All three ingestion paths — postback, import, adapter sync — run
through the identical pipeline: normalize → validate → attribute (by
`click_id`) → resolve commercial term → calculate commission → dedupe
→ store. Nothing about attribution or commission math differs by
transport.

---

## 1. Live postback endpoint

```
POST /api/v1/conversions/postback/:endpoint_token
GET  /api/v1/conversions/postback/:endpoint_token
```

Unauthenticated at the session/cookie level — this route sits **before**
the normal login check. Each request authenticates itself against the
`postback_configs` row matching `:endpoint_token`, created via the
**Postback Integrations** admin page (`/en/dashboard/postback-configs`)
or `POST /api/v1/postback-config/create`.

An unknown or disabled token returns a generic `404` — the response
never distinguishes "wrong token" from "wrong auth" from "token
disabled", to avoid handing an attacker a probing oracle.

### Authentication

Configured per integration, one of:

| `auth_method` | How it's verified |
|---|---|
| `hmac_sha256` | HMAC-SHA256 over the raw request body (or the timestamp param if there's no body), hex-encoded, sent in the param named by `signature_param` |
| `signed_query` | HMAC-SHA256 over the canonical query string (all params except the signature itself, sorted by key, `key=value` joined with `&`) |
| `shared_secret` | A static secret sent verbatim in `signature_param`, compared with a constant-time check |
| `api_key` | Same as `shared_secret`, different semantic name |

The actual secret is **never** stored in the database. `credential_reference`
on the integration is a pointer to a Cloudflare Worker secret:

```
wrangler secret put GGBET_POSTBACK_SECRET
```

then set `credential_reference` to `GGBET_POSTBACK_SECRET` when
creating the integration. If that secret isn't bound, every request
fails closed with `credential_not_configured` — there is no "no auth
required" fallback state.

**Replay protection**: if the integration has a `timestamp_param`
configured, every request must include a timestamp within
`timestamp_tolerance_seconds` (default 300) of the server's clock, or
it's rejected as `timestamp_out_of_tolerance`.

**IP allowlisting**: optional, exact-match against a JSON array of IPs
on the integration.

### Parameters

Field names are fully configurable per integration (`field_mapping_json`),
so a network can send whatever field names it already uses. Without any
mapping, these aliases are tried automatically:

| Canonical field | Recognized aliases |
|---|---|
| `click_id` | `click_id`, `clickid`, `subid`, `sub_id`, `aff_click_id` |
| `conversion_type` | `conversion_type`, `event`, `type` |
| `status` | `status` |
| `reported_value` | `reported_value`, `amount`, `value`, `revenue` |
| `currency` | `currency` (defaults to `USD`) |
| `country_code` | `country_code`, `country`, `geo` |
| `external_reference` | `external_reference`, `transaction_id`, `conversion_id` |
| `occurred_at` | `occurred_at`, `timestamp` |
| `reported_commission` | `reported_commission`, `commission` (statement/import context only — see §4) |
| `casino_id` | `casino_id` (fallback attribution when there's no `click_id` — see §5) |

A `field_mapping_json` can also remap *values*, not just field names:

```json
{
  "click_id": "subid",
  "conversion_type": "event",
  "conversion_type_map": { "reg": "registration", "dep1": "ftd" },
  "status_map": { "approved": "confirmed", "declined": "rejected" }
}
```

### Conversion types

`registration`, `qualified_lead`, `ftd`, `deposit`, `cpa_conversion`,
`revshare`, `hybrid`, `adjustment`, `refund`, `chargeback`

### Statuses

`pending` (default if omitted), `confirmed`, `rejected`

### Example request

```
POST /api/v1/conversions/postback/8f3a1c2b9e7d4f60a1b2c3d4e5f60718
Content-Type: application/json
```
```json
{
  "click_id": "abc123",
  "event": "ftd",
  "status": "confirmed",
  "amount": 100,
  "currency": "EUR",
  "transaction_id": "GG-998877",
  "sig": "…hex hmac…"
}
```

### Response

Always `200` for a well-formed, authenticated request — a duplicate or
an unattributed conversion is a legitimate outcome, not an error a
provider's retry logic should act on:

```json
{ "success": true, "outcome": "accepted", "conversion_id": 4821, "attributed": true }
```

`outcome` is one of `accepted`, `duplicate`, `unattributed`.

| HTTP status | Meaning |
|---|---|
| `200` | Processed (see `outcome`) |
| `400` | Malformed body, or validation failed (`details` array explains why) |
| `401` | Signature/secret/timestamp/IP check failed |
| `404` | Unknown or disabled `endpoint_token` |
| `429` | Rate limit exceeded (default 120/minute per integration) |
| `500` | Internal error processing the conversion (logged, never exposes internals) |

### Deduplication

A conversion is deduplicated on `(account_id, external_reference, source)`.
Sending the same `external_reference` twice through the **same**
integration is silently treated as `outcome: "duplicate"`, not an
error. The `source` column is part of the key deliberately — see §4:
a live postback and a later statement import for the *same* underlying
transaction are expected to coexist, not collide.

### Attribution

Exact `click_id` match only, against the same event stream the
tracking redirect writes to. No time-window or last-touch guessing. If
`click_id` doesn't match anything (or wasn't sent), the conversion is
still recorded — with `outcome: "unattributed"` and `click_id: null` —
never silently dropped, and never guessed.

**Security boundary**: if a `click_id` *does* match, but the matched
tracking link belongs to a different program than the integration's
own account, the conversion is recorded as unattributed rather than
credited — this stops a leaked postback URL for one program from being
able to attribute (and get paid for) a different program's traffic.

---

## 2. CSV / JSON import

```
POST /api/v1/imports/conversions
```
```json
{
  "account_id": 100,
  "format": "csv",
  "content": "transaction_id,event,status,amount,currency,commission\nGG-1,ftd,confirmed,100,EUR,35",
  "field_mapping": null,
  "label": "March statement"
}
```

Runs every row through the exact same normalize/attribute/commission/
dedupe pipeline as a live postback, with `source: "import"`. A bad row
never aborts the batch — it's reported per-row in the response and in
the batch's history:

```json
{
  "success": true, "batchId": 12, "totalRows": 200,
  "importedCount": 197, "duplicateCount": 2, "unattributedCount": 8,
  "errorCount": 1, "errors": [{ "row": 84, "message": "conversion_type must be one of: ..." }]
}
```

Because imports often carry a network's own commission figure, this
path additionally reads `reported_commission` (default alias:
`commission`) into a dedicated column — **never** into
`calculated_commission`, which this platform always computes itself
from `affiliate_commercial_terms`. The two are compared side by side in
the Reconciliation report (§4).

Import rows frequently have no `click_id` at all (a statement lists
the casino/brand, not your click IDs). If the row's `casino_id` field
(or `casino_id_map` in `field_mapping_json`, for translating a
provider's own brand code) is present, it's used as attribution
fallback when click-based attribution finds nothing.

See `GET /api/v1/imports/list` and `GET /api/v1/import/get?id=` for
history, or the **Import History** dashboard page.

---

## 3. Outbound provider adapters

For networks with their own reporting API rather than an inbound
postback. Configured via `POST /api/v1/provider-adapter/create` or the
**Provider API Adapters** dashboard page, then either synced on a
schedule (cron, off by default — see below) or on demand via
`POST /api/v1/provider-adapter/sync-now`.

Only one adapter ships: `generic_rest` — a configurable "GET a JSON
array of conversions for a date range, static auth header" client.
There is deliberately no GG.BET/PIN-UP/BetMGM/etc.-specific adapter:
each of those needs that network's actual, documented API and real
credentials to implement correctly, and this isn't the place to guess.
Adding one is: implement `worker/adapters/base.js`'s
`BaseAffiliateProvider` interface (`authenticate`, `fetchConversions`,
`fetchRevenue`, `fetchCommissions`, `fetchReports`,
`normalizeConversion`, `healthCheck`) and register it in
`worker/adapters/registry.js`.

A sync run is recorded in the same `import_batches` history as a
manual CSV upload (`format: "api"`), and every conversion it writes is
`source: "import"` — reconciliation doesn't distinguish a scheduled API
pull from a hand-uploaded statement; both are "what the network's own
report says", as opposed to "what we received live" (postbacks).

The scheduled sync itself is gated by `system_settings.provider_sync_cron_enabled`
(default `'false'`) — it will not make outbound network calls until an
operator has actually configured a real integration and turned this on.

---

## 4. Reconciliation

Not a separate API — it's report type `reconciliation` on the existing
report engine (`POST /api/v1/report/run`, after creating a
`report_definitions` row with that type), so it inherits CSV/HTML/JSON
export for free. Compares, per casino/account/currency:

- **Internal** (`source IN ('postback','manual')`): clicks,
  registrations, FTDs, deposits, revenue, and `calculated_commission`
  (this platform's own figure, from commercial terms).
- **Reported** (`source = 'import'`): revenue and `reported_commission`
  (whatever the network's own statement/API said).

A scope/period with **no** import data at all is reported as `status:
"missing"` — never a fabricated zero-difference match. Once both sides
exist, `status` is `matched` (within tolerance, default 2%),
`underpaid` (we expected more than they reported), or `overpaid` (they
reported more than we expected).

---

## 5. Cohort analysis

Also a report type (`cohort_analysis`), not a separate endpoint.
`filters.cohortMetric` is one of:

- `registration_to_ftd` / `ftd_to_deposit` — cohort = every `click_id`
  whose earliest event of the "from" type falls in the requested date
  range; reports cohort size, how many later converted to the "to"
  type, and the average days between.
- `revenue_by_cohort` — cohort = every `click_id`'s earliest conversion
  of any type; reports total revenue/commission across **all** of that
  click_id's later conversions, keyed by the acquisition date.

`filters.groupByDimension` (`casino` | `geo` | `campaign`) splits each
cohort further. Fields that don't apply to the requested metric come
back as `null`, never `0` — e.g. `revenue_by_cohort` never reports an
`avg_days_to_convert`.

`click_id` is the only cross-conversion identifier this platform has;
a cohort is only as accurate as click-level attribution allows (see
§1's attribution rules), and rows with no `click_id` are excluded
rather than merged into a misleading "no cohort" bucket.

---

## Testing an integration before going live

`POST /api/v1/postback-config/test` runs the exact same pipeline a
live postback would, in dry-run mode — nothing is ever written to
`analytics_conversions`. Response shape:

```json
{
  "success": true, "outcome": "would_accept",
  "steps": {
    "click_found": true, "tracking_link_resolved": true, "casino_resolved": true,
    "partner_resolved": true, "account_resolved": true, "program_mismatch": false,
    "commercial_term_resolved": true, "commission_calculated": true
  },
  "calculated_commission": 40, "term_id": 7
}
```

The **Postback Integrations** dashboard page renders this as a ✓/✗
checklist.
