import { route } from '../../../../../../lib/http.js';
import { listMembers } from '../../../../../../lib/services/orgs.js';

export const GET = route(async ({ db }) => listMembers(db), { action: 'members.read' });
