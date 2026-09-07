export async function logClick(
  db,
  casinoSlug,
  country,
  city,
  ipHash,
  userAgent,
  { trackingLinkId = null, offerId = null } = {}
) {

  return await db
    .prepare(`
      INSERT INTO clicks (
        casino_slug,
        country_code,
        city,
        ip_hash,
        user_agent,
        tracking_link_id,
        offer_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      casinoSlug,
      country,
      city,
      ipHash,
      userAgent,
      trackingLinkId,
      offerId
    )
    .run();
}
