import { route } from '../../../../lib/http.js';
import { listMyOrgs } from '../../../../lib/services/orgs.js';

export const GET = route(async ({ user }) => ({ user, orgs: await listMyOrgs(user.id) }));
