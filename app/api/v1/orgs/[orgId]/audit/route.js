import { z } from 'zod';
import { route } from '../../../../../../lib/http.js';
import { withOrg } from '../../../../../../lib/db.js';
import { listAudit } from '../../../../../../lib/services/audit.js';

const q = z.object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(500).optional() });
export const GET = route(async ({ request, db }) => {
  const p = q.parse(Object.fromEntries(new URL(request.url).searchParams));
  return { entries: await withOrg(db, (c) => listAudit(c, p)) };
}, { action: 'audit.read' });
