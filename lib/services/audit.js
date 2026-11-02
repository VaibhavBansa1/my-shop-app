export async function audit(client, { orgId, userId }, action, entity, entityId, data = {}) {
  await client.query(
    'insert into audit_log (org_id, user_id, action, entity, entity_id, data) values ($1, $2, $3, $4, $5, $6)',
    [orgId, userId, action, entity, entityId == null ? null : String(entityId), data],
  );
}

export async function listAudit(client, { limit = 100, before } = {}) {
  const { rows } = await client.query(
    `select a.id, a.action, a.entity, a.entity_id, a.data, a.at, u.name as user_name, u.email as user_email
       from audit_log a left join users u on u.id = a.user_id
      where ($1::bigint is null or a.id < $1)
      order by a.id desc limit $2`,
    [before ?? null, Math.min(limit, 500)],
  );
  return rows;
}

/** Contact fields are encrypted in their tables; the activity log records only that they changed. */
export function redactContact(details) {
  const out = { ...details };
  for (const k of ['phone', 'email', 'address']) if (out[k] !== undefined) out[k] = '(changed)';
  return out;
}
