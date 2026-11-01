# Notifications and messages

Two kinds: **alerts to your team** inside the app, and **messages to customers** (payment reminders).

## Alerts inside the business (🔔)
| Alert | Who gets it | Why it is useful |
|---|---|---|
| **Bill cancelled / corrected** — "INV/26-27/15 cancelled by Rahul · ₹1,071 · Reason: …" | Owners and admins (not the person who did it) | Catches mistakes and fraud: a cashier cancelling a cash bill after taking the money is a classic leak. |
| **Low stock** — "Low stock: Detergent 1kg — 4 pcs left (reorder level 5)" | Accountants, admins, owners | Sent once, at the moment a sale pushes an item to or below its reorder level, so you reorder in time. |
| **New member** — "Priya joined as cashier" | Owners and admins | Know who has access to your books. |
| **Daily summary** — "2026-11-01: sales ₹12,450 (38 bills) · receipts · dues · low stock · cancellations" | Accountants, admins, owners; **email** to those who switch it on in Settings → Notifications | The owner sees the day without opening reports. |

The website shows an unread count next to **Notifications**; the phone shows it on the **More** tab. Old
notifications are deleted after 90 days.

### Daily summary job
Run once a day (e.g. 8:30 am) with your scheduler:
```bash
npm run notify:daily
```
Linux cron example: `30 8 * * * cd /path/to/my-shop-app && npm run notify:daily`. It skips businesses with
no activity. Email needs a provider (docs/EMAIL.md).

## Payment reminders to customers
From **Reports → Receivables → Remind**, or a customer's ledger (**Send payment reminder**), on web and phone:
- ready-made message in **English, Hindi or Hinglish** with the amount due as of today;
- includes your **UPI ID** (Settings → Business details) so the customer can pay at once;
- **WhatsApp** (opens WhatsApp with the customer's number and the text), **SMS**, **Email** (sent by the
  server when the customer has an email and email is configured) or **Copy**;
- you can edit the text before sending;
- every reminder is recorded ("Last reminded 3 Nov by WhatsApp") in the activity log;
- limits: 3 reminders per customer per day, 200 per business per day (prevents spamming customers).

Phone numbers are read from the customer ledger: `98765 43210`, `+91 98765 43210` and `09876543210` all
become `919876543210`.

## Share a bill
- Phone app: **Share / print PDF** → choose WhatsApp (sends the PDF).
- Website: **WhatsApp** on a sales bill sends a text summary (items and total); **Print / PDF** for the PDF.

## Security and privacy
- Each notification belongs to one person in one business; database row-level security means nobody else —
  not even other members — can read it, and nobody can delete or edit it except marking it read.
- Notification links can only be in-app paths (no outside links can be planted).
- Reminder messages go only to the customer's own saved phone/email; the server never sends SMS/WhatsApp
  itself (those open on your device), so no third-party messaging account is needed.

## Not yet (next steps)
- **Phone push notifications** (alerts when the app is closed): needs an Expo/EAS project and Firebase
  credentials for Android. The in-app inbox already holds everything a push would show.
- Automatic WhatsApp Business API messages (needs a paid WhatsApp Business account and template approval).
