# Email

Used for: confirming new accounts, password reset links, invitations, and a welcome message.
Sending never blocks sign-up or invitations; invitation links are also shown on screen to share by WhatsApp.

## Providers (pick one in `.env.local`)
- **SMTP** — any mail server. Gmail: turn on 2-step verification, create an *App password*, then
  `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`.
  Zoho, Brevo, Amazon SES SMTP and most hosts work the same way. TLS is required for remote servers.
- **Resend** — `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`. Verify your sending domain in Resend.
- **Mailpit (testing)** — `docker compose up -d`, then `EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`,
  `SMTP_PORT=1025`; read every email at http://localhost:8025.
- **Nothing set** — development prints emails to the server log; production logs a warning.

Always set `EMAIL_FROM` (e.g. `My Shop <no-reply@your-domain.in>`) and `APP_ORIGIN` (used in links).
For good delivery on your own domain, add SPF/DKIM records as your provider explains.

## Account verification
`EMAIL_VERIFICATION=required | optional | off` (default: required when a real provider is set, else off).
- *required*: people can sign in, but must confirm their email before creating or joining a business.
- *optional*: a reminder banner only.
- Links are one-time, valid 24 hours, stored hashed, carried in the URL fragment (not logged); resend is
  limited to 5 per hour.
