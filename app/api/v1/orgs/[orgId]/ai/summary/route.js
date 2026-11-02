import { route, readJson } from '../../../../../../../lib/http.js';
import { aiSummarySchema } from '../../../../../../../lib/validation.js';
import { summarize } from '../../../../../../../lib/services/aiSummary.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const POST = route(async ({ request, db, user }) =>
  summarize(db, aiSummarySchema.parse(await readJson(request)), { userId: user.id }), { action: 'reports.read', flag: 'ai' });
