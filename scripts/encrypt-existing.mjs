// One-off: encrypt contact fields saved before DATA_ENCRYPTION_KEY was set. Safe to re-run.
//   DATA_ENCRYPTION_KEY=... DATABASE_URL=... node scripts/encrypt-existing.mjs
import { getPool, withOrg } from '../lib/db.js';
import { encryptField, isEncrypted, encryptionEnabled } from '../lib/crypto.js';

if (!encryptionEnabled()) { console.error('Set DATA_ENCRYPTION_KEY first.'); process.exit(1); }
const { rows: orgs } = await getPool().query('select * from job_org_owners()');
let changed = 0;
for (const o of orgs) {
  await withOrg({ userId: o.owner_id, orgId: o.org_id }, async (c) => {
    for (const table of ['ledgers', 'organizations']) {
      const { rows } = await c.query(`select id, phone, email, address from ${table} where ${table === 'organizations' ? 'id' : 'org_id'} = app_org_id()`);
      for (const r of rows) {
        if ([r.phone, r.email, r.address].every((v) => !v || isEncrypted(v))) continue;
        await c.query(`update ${table} set phone = $2, email = $3, address = $4 where id = $1`,
          [r.id, encryptField(r.phone), encryptField(r.email), encryptField(r.address)]);
        changed++;
      }
    }
  });
}
console.log(`encrypted contact fields in ${changed} rows across ${orgs.length} businesses`);
await getPool().end();
