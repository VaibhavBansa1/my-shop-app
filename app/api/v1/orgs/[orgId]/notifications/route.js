import { route } from '../../../../../../lib/http.js';
import { listNotifications } from '../../../../../../lib/services/notifications.js';

export const GET = route(async ({ request, db }) => {
  const sp = new URL(request.url).searchParams;
  return listNotifications(db, { unreadOnly: sp.get('unread') === '1', limit: Math.min(Number(sp.get('limit')) || 50, 200) });
}, { action: 'notifications.read' });
