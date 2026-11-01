import { route, readJson } from '../../../../../../lib/http.js';
import { notifySettingsSchema } from '../../../../../../lib/validation.js';
import { getSettings, updateSettings } from '../../../../../../lib/services/notifications.js';

export const GET = route(async ({ db }) => getSettings(db), { action: 'notifications.read' });
export const PATCH = route(async ({ request, db }) => updateSettings(db, notifySettingsSchema.parse(await readJson(request))), { action: 'notifications.read' });
