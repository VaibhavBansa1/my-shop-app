import { route } from '../../../../../lib/http.js';
import { myEvents } from '../../../../../lib/services/securityLog.js';

export const GET = route(async ({ user }) => ({ events: await myEvents(user.id, 100) }));
