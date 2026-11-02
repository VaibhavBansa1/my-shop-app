// Feature flags (operator tool; uses DATABASE_OWNER_URL).
//   npm run flags                         list
//   npm run flags -- off ocr              switch a feature off everywhere
//   npm run flags -- on ocr
//   npm run flags -- rollout ai 20        on for ~20% of businesses (stable per business)
//   npm run flags -- allow ai <orgId>     always on for one business (beta tester)
//   npm run flags -- deny ai <orgId>      always off for one business
//   npm run flags -- add <key> "description"
import pg from 'pg';

const url = process.env.DATABASE_OWNER_URL;
if (!url) { console.error('Set DATABASE_OWNER_URL'); process.exit(1); }
const c = new pg.Client({ connectionString: url });
await c.connect();
const [cmd, key, arg] = process.argv.slice(2);
const UUID = /^[0-9a-f-]{36}$/i;
try {
  if (cmd === 'on' || cmd === 'off') await c.query('update feature_flags set enabled = $2, updated_at = now() where key = $1', [key, cmd === 'on']);
  else if (cmd === 'rollout') await c.query('update feature_flags set rollout_percent = $2, updated_at = now() where key = $1', [key, Number(arg)]);
  else if ((cmd === 'allow' || cmd === 'deny') && UUID.test(arg ?? '')) {
    const col = cmd === 'allow' ? 'allow_orgs' : 'deny_orgs';
    await c.query(`update feature_flags set ${col} = array_append(array_remove(${col}, $2::uuid), $2::uuid), updated_at = now() where key = $1`, [key, arg]);
  } else if (cmd === 'add') await c.query('insert into feature_flags (key, description) values ($1, $2) on conflict (key) do nothing', [key, arg ?? '']);
  else if (cmd) { console.error('Unknown command. See the comment at the top of scripts/flags.mjs'); process.exit(1); }
  const { rows } = await c.query('select key, enabled, rollout_percent, cardinality(allow_orgs) allow, cardinality(deny_orgs) deny, description from feature_flags order by key');
  console.table(rows);
  if (cmd) console.log('Changes apply within 30 seconds (cache). Env overrides FLAG_<KEY>=on|off win over this table.');
} finally { await c.end(); }
