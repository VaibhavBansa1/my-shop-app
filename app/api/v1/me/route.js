import { route } from '../../../../lib/http.js';
import { listMyOrgs } from '../../../../lib/services/orgs.js';
import { isVerified, verificationPolicy } from '../../../../lib/services/verification.js';
import { aiStatus } from '../../../../lib/ai/index.js';

export const GET = route(async ({ user }) => ({
  user: { ...user, emailVerified: await isVerified(user.id) },
  verification: verificationPolicy(),
  ai: aiStatus(),
  orgs: await listMyOrgs(user.id),
}));
