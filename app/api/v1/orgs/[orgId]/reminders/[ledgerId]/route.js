import { z } from 'zod';
import { route, readJson } from '../../../../../../../lib/http.js';
import { reminderSchema, uuid } from '../../../../../../../lib/validation.js';
import { prepareReminder, sendReminder } from '../../../../../../../lib/services/reminders.js';

const q = z.object({ language: z.enum(['en', 'hi', 'hinglish']).optional() });

export const GET = route(async ({ request, db, params }) =>
  prepareReminder(db, uuid.parse(params.ledgerId), q.parse(Object.fromEntries(new URL(request.url).searchParams))), { action: 'reminders.send' });
export const POST = route(async ({ request, db, params }) =>
  sendReminder(db, uuid.parse(params.ledgerId), reminderSchema.parse(await readJson(request))), { action: 'reminders.send' });
