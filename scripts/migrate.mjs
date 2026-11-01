// Applies db/migrations/*.sql in order, once each, as the owner role.
// Usage: DATABASE_OWNER_URL=postgres://shop_owner:...@host/db npm run db:migrate
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  console.error('DATABASE_OWNER_URL is not set (connection string for the shop_owner role).');
  process.exit(1);
}

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'db', 'migrations');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`create table if not exists schema_migrations (
    name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
  // Only one migrator at a time.
  await client.query('select pg_advisory_lock(727274)');
  const applied = new Map(
    (await client.query('select name, checksum from schema_migrations')).rows.map((r) => [r.name, r.checksum]),
  );
  const files = (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`Migration ${file} was edited after being applied. Write a new migration instead.`);
      }
      continue;
    }
    process.stdout.write(`applying ${file} ... `);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [file, checksum]);
      await client.query('commit');
      console.log('ok');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }
  console.log('migrations up to date');
} finally {
  await client.end();
}
