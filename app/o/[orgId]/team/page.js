'use client';
import { useState } from 'react';
import { api } from '../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead, Field } from '../../../ui/components.js';
import { useOrg } from '../../../ui/OrgContext.js';
import { ROLE_LABEL, date } from '../../../ui/format.js';

const ROLE_HELP = {
  owner: 'Everything, including deleting the business.', admin: 'Everything except deleting the business; manages team.',
  accountant: 'All vouchers, ledgers, items, cancelling vouchers.', cashier: 'Sales bills, receipts and new customers.',
  viewer: 'Can see books and reports, cannot change anything.',
};

export default function Team() {
  const { org, can } = useOrg();
  const list = useApi(() => api(`/orgs/${org.id}/members`), [org.id]);
  const [form, setForm] = useState({ email: '', role: 'cashier' });
  const [link, setLink] = useState(null);
  const [emailed, setEmailed] = useState(false);
  const [emailChecked, setEmailChecked] = useState(true);
  const [error, setError] = useState(null);
  const manageable = org.role === 'owner' ? ['owner', 'admin', 'accountant', 'cashier', 'viewer'] : ['accountant', 'cashier', 'viewer'];

  async function act(fn) { setError(null); try { await fn(); list.reload(); } catch (e) { setError(e); } }
  async function invite(e) {
    e.preventDefault();
    await act(async () => { const r = await api(`/orgs/${org.id}/invitations`, { method: 'POST', body: form }); setLink(r.link); setEmailed(r.emailed); setEmailChecked(r.emailChecked !== false); setForm({ ...form, email: '' }); });
  }

  if (!can('members.read')) return <ErrorNote error={new Error('Only admins and owners can manage the team.')} />;
  return (
    <>
      <PageHead title="Team" sub="Who can use this business, and what they can do" />
      <ErrorNote error={error || list.error} />
      <form className="card grid" onSubmit={invite}>
        <h2>Invite someone</h2>
        <div className="grid grid-2">
          <Field label="Their email"><input type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role" hint={ROLE_HELP[form.role]}><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {manageable.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        </div>
        <div className="row"><button className="btn btn-primary">Create invitation link</button></div>
        {link && (
          <div className="note note-ok">
            {emailed ? 'Invitation emailed. You can also share this link (WhatsApp, SMS).' : 'Share this link with them (WhatsApp, SMS or email).'} It works once, for that email only, for 7 days. It will not be shown again.
            {!emailChecked && <p style={{ marginTop: 6 }}><b>Note:</b> this server does not confirm email addresses, so whoever has this link could sign up with that email. Send it only to that person, not to a group.</p>}
            <div className="row" style={{ marginTop: 8 }}><input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(link)}>Copy</button></div>
          </div>
        )}
      </form>
      {list.loading && !list.data ? <Loading /> : list.data && (
        <>
          <div className="card">
            <h2>Members</h2>
            <div className="table-wrap"><table>
              <thead><tr><th>Name</th><th>Role</th><th>Joined</th><th></th></tr></thead>
              <tbody>{list.data.members.map((m) => (
                <tr key={m.userId}><td>{m.name}<div className="muted" style={{ fontSize: 12 }}>{m.email}</div></td>
                  <td>{manageable.includes(m.role) ? (
                    <select value={m.role} onChange={(e) => act(() => api(`/orgs/${org.id}/members/${m.userId}`, { method: 'PATCH', body: { role: e.target.value } }))} aria-label={`Role of ${m.name}`}>
                      {manageable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>) : ROLE_LABEL[m.role]}</td>
                  <td>{date(m.joinedAt)}</td>
                  <td className="num">{manageable.includes(m.role) && <button className="btn btn-sm btn-danger" onClick={() => confirm(`Remove ${m.name}?`) && act(() => api(`/orgs/${org.id}/members/${m.userId}`, { method: 'DELETE' }))}>Remove</button>}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
          {list.data.invitations.length > 0 && (
            <div className="card"><h2>Pending invitations</h2><table><tbody>{list.data.invitations.map((i) => (
              <tr key={i.id}><td>{i.email}</td><td>{ROLE_LABEL[i.role]}</td><td className="muted">expires {date(i.expiresAt)}</td>
                <td className="num"><button className="btn btn-sm" onClick={() => act(() => api(`/orgs/${org.id}/invitations/${i.id}`, { method: 'DELETE' }))}>Revoke</button></td></tr>
            ))}</tbody></table></div>
          )}
        </>
      )}
    </>
  );
}
