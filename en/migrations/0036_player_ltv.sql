-- =====================================================
-- 0036_player_ltv.sql
-- Player/LTV analytics (brief §18).
--
-- Brief §18 is explicit: "Do NOT introduce unnecessary PII" and use
-- anonymous identifiers -- click_id, session_id, or "external
-- player/reference ID only when legally and technically appropriate."
-- This column is exactly that last case: a provider's OWN player/
-- customer reference (whatever they call it -- player_id, customer_id,
-- user_id), stored verbatim as an opaque string, never decoded,
-- enriched, or joined against anything else this platform knows about
-- a person. It exists only because SOME networks include it in their
-- postbacks/statements and, without it, cross-conversion player
-- rollups are impossible (click_id resets per click/session, not per
-- player). Nullable and almost always empty -- most conversions will
-- never have one, and that's fine: worker/database/reports.js
-- handleLtvAnalysis() distinguishes "no players with this data yet"
-- from "zero revenue" per brief §29, never fabricating the former as
-- the latter.
-- =====================================================

ALTER TABLE analytics_conversions ADD COLUMN external_player_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversions_player ON analytics_conversions(account_id, external_player_id);
