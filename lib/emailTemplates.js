// Plain, escaped email templates (text + minimal HTML). All dynamic values are escaped.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const APP = () => process.env.APP_NAME || 'My Shop';

function wrap(title, paragraphs, link, linkLabel) {
  const text = `${paragraphs.join('\n\n')}${link ? `\n\n${linkLabel}: ${link}` : ''}\n\n— ${APP()}\n`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:560px;margin:auto;padding:16px">
<h2 style="color:#0f766e">${esc(title)}</h2>${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
${link ? `<p><a href="${esc(link)}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(linkLabel)}</a></p>
<p style="color:#666;font-size:12px">If the button does not work, copy this link: ${esc(link)}</p>` : ''}
<p style="color:#666;font-size:12px">— ${esc(APP())}</p></body></html>`;
  return { text, html };
}

export function verifyEmailMessage(name, link) {
  return { subject: `Confirm your email for ${APP()}`, ...wrap('Confirm your email', [`Hello ${name},`,
    `Please confirm this email address for your ${APP()} account. The link works for 24 hours.`,
    'If you did not create an account, you can ignore this email.'], link, 'Confirm email') };
}

export function resetMessage(name, link, minutes) {
  return { subject: `Reset your ${APP()} password`, ...wrap('Reset your password', [`Hello ${name},`,
    `Someone (hopefully you) asked to reset your password. The link works for ${minutes} minutes.`,
    'If you did not ask for this, ignore this email; your password stays the same.'], link, 'Choose a new password') };
}

export function inviteMessage(orgName, inviterName, role, link) {
  return { subject: `${inviterName} invited you to ${orgName} on ${APP()}`, ...wrap(`Join ${orgName}`, [
    `${inviterName} has invited you to join ${orgName} as ${role}.`,
    'Open the link, then sign in or create an account with this same email address. The invitation works for 7 days.'], link, 'Accept invitation') };
}

export function welcomeMessage(name) {
  return { subject: `Welcome to ${APP()}`, ...wrap('Welcome!', [`Hello ${name},`,
    'Your account is ready. Create your business, add your items, and start billing.',
    'Tip: invite your staff from the Team page and give each person only the role they need.'], null, null) };
}

export function emailChangeConfirmMessage(name, link) {
  return { subject: `Confirm your new email for ${APP()}`, ...wrap('Confirm your new email', [`Hello ${name},`,
    `You asked to use this address to sign in to ${APP()}. The link works for 24 hours. Until you open it, nothing changes.`,
    'If you did not ask for this, ignore this email.'], link, 'Use this email') };
}
export function emailChangeAlertMessage(name, newEmail) {
  return { subject: `Someone asked to change your ${APP()} email`, ...wrap('Email change requested', [`Hello ${name},`,
    `Someone signed in to your account asked to change its email to ${newEmail}. It changes only if that address confirms it.`,
    'If this was not you: sign in, change your password, turn on two-step login, and sign out other devices in Settings.']) };
}
export function emailChangedMessage(name, newEmail) {
  return { subject: `Your ${APP()} email was changed`, ...wrap('Email changed', [`Hello ${name},`,
    `Your account now signs in with ${newEmail}. All devices were signed out.`,
    'If this was not you, reply to this email or contact the business you work with straight away.']) };
}
export function accountDeletedMessage(name) {
  return { subject: `Your ${APP()} account was deleted`, ...wrap('Account deleted', [`Hello ${name},`,
    'Your account was deleted and you were signed out everywhere. Bills you entered stay in the books of the businesses you worked for, shown as "Deleted user".']) };
}
