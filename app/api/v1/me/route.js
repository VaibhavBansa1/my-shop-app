import { route, readJson, json, clientIp, clearSessionCookie } from '../../../../lib/http.js';
import { listMyOrgs } from '../../../../lib/services/orgs.js';
import { isVerified, verificationPolicy } from '../../../../lib/services/verification.js';
import { aiStatus } from '../../../../lib/ai/index.js';
import { accountNameSchema, deleteAccountSchema } from '../../../../lib/validation.js';
import { updateName, deleteAccount, soleOwnerBusinesses } from '../../../../lib/services/accountSettings.js';
import { securityEvent } from '../../../../lib/services/securityLog.js';

export const GET = route(async ({ user }) => ({
  user: { ...user, emailVerified: await isVerified(user.id) },
  verification: verificationPolicy(),
  ai: aiStatus(),
  orgs: await listMyOrgs(user.id),
  blocksDeletion: await soleOwnerBusinesses(user.id),
}));

// Change your display name.
export const PATCH = route(async ({ request, user, requestId }) => {
  const { name } = accountNameSchema.parse(await readJson(request));
  await updateName(user.id, name);
  await securityEvent('account.name_changed', { userId: user.id, ip: clientIp(request), requestId });
  return { ok: true };
});

// Delete your account: {password, code (if two-step login is on), confirm: "DELETE"}.
export const DELETE = route(async ({ request, user, requestId }) => {
  const body = deleteAccountSchema.parse(await readJson(request));
  await securityEvent('account.delete_requested', { userId: user.id, ip: clientIp(request), requestId });
  await deleteAccount(user.id, body);
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
});
