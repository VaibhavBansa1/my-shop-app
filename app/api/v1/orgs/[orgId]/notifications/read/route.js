import { route, readJson } from '../../../../../../../lib/http.js';
import { markReadSchema } from '../../../../../../../lib/validation.js';
import { markRead } from '../../../../../../../lib/services/notifications.js';

export const POST = route(async ({ request, db }) => markRead(db, markReadSchema.parse(await readJson(request))), { action: 'notifications.read' });
