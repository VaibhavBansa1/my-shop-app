// Two-step login for the signed-in user.
//   GET                               -> { enabled, enabledAt, recoveryCodesLeft }
//   POST {action:'setup', password}   -> { secret, uri }      (not active yet)
//   POST {action:'enable', code}      -> { recoveryCodes }    (shown once)
//   POST {action:'recovery-codes', password, code} -> { recoveryCodes } (new set; old ones stop working)
//   POST {action:'disable', password, code}
import { z } from 'zod';
import { route, readJson, clientIp } from '../../../../../lib/http.js';
import { securityEvent } from '../../../../../lib/services/securityLog.js';
import * as TF from '../../../../../lib/services/twoFactor.js';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup'), password: z.string().min(1).max(200) }),
  z.object({ action: z.literal('enable'), code: z.string().trim().min(6).max(20) }),
  z.object({ action: z.literal('recovery-codes'), password: z.string().min(1).max(200), code: z.string().trim().min(6).max(20) }),
  z.object({ action: z.literal('disable'), password: z.string().min(1).max(200), code: z.string().trim().min(6).max(20) }),
]);

export const GET = route(async ({ user }) => TF.twoFactorStatus(user.id));
export const POST = route(async ({ request, user, requestId }) => {
  const b = body.parse(await readJson(request));
  const ev = (event) => securityEvent(event, { userId: user.id, ip: clientIp(request), requestId, userAgent: request.headers.get('user-agent') });
  if (b.action === 'setup') return TF.startSetup(user.id, b.password);
  if (b.action === 'enable') { const r = await TF.enableTwoFactor(user.id, b.code); await ev('mfa.enabled'); return r; }
  if (b.action === 'recovery-codes') { const r = await TF.regenerateRecoveryCodes(user.id, b); await ev('mfa.codes_regenerated'); return r; }
  await TF.disableTwoFactor(user.id, b); await ev('mfa.disabled');
  return { ok: true };
});
