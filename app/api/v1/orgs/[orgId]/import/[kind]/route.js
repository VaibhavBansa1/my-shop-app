import { z } from 'zod';
import { route, readBodyLimited, parseJsonStrict } from '../../../../../../../lib/http.js';
import { importRows, MAX_IMPORT_ROWS } from '../../../../../../../lib/services/importData.js';
import { badRequest, notFound } from '../../../../../../../lib/errors.js';

const body = z.object({
  rows: z.array(z.record(z.string().max(60), z.string().max(1000))).min(1).max(MAX_IMPORT_ROWS),
  dryRun: z.boolean().optional().default(true),
  skipExisting: z.boolean().optional().default(false),
}).strict();

// Larger body limit than other endpoints (a few thousand rows), still bounded.
export const POST = route(async ({ request, db, params }) => {
  if (!['items', 'parties'].includes(params.kind)) throw notFound('Unknown import type.');
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) throw badRequest('Content-Type must be application/json.');
  const data = parseJsonStrict((await readBodyLimited(request, 4 * 1024 * 1024, 'The file is too large (max 4 MB).')).toString('utf8'));
  const p = body.parse(data);
  return importRows(db, params.kind, p.rows, { dryRun: p.dryRun, skipExisting: p.skipExisting });
}, { action: 'masters.write', flag: 'import' });
