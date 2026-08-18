export async function getSetting(
  db,
  key
) {

  const setting = await db
    .prepare(`
      SELECT value
      FROM settings
      WHERE key = ?
    `)
    .bind(key)
    .first();

  return setting?.value || null;
}


export async function getAllSettings(db) {
  if (!db) return {};

  const result = await db
    .prepare(`
      SELECT key, value
      FROM settings
    `)
    .all();

  const settings = {};

  for (const row of result.results || []) {
    settings[row.key] = row.value;
  }

  return settings;
}

export async function saveSettings(
 db,
 settings
){
 for(const key in settings){

  await db.prepare(`
  INSERT OR REPLACE INTO settings(
   key,
   value,
   updated_at
  )
  VALUES(
   ?,
   ?,
   CURRENT_TIMESTAMP
  )
  `)
  .bind(
   key,
   String(settings[key])
  )
  .run();
 }

 return true;
}



export async function getAllSettings(db) {
  if (!db) return {};

  const result = await db
    .prepare(`
      SELECT key, value
      FROM settings
    `)
    .all();

  const settings = {};

  for (const row of result.results || []) {
    settings[row.key] = row.value;
  }

  return settings;
}
