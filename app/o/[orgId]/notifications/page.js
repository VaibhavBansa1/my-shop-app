'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../../ui/api.js';
import { useApi, Loading, ErrorNote, PageHead, Empty } from '../../../ui/components.js';
import { useOrg } from '../../../ui/OrgContext.js';

const ICON = { voucher_cancelled: '⚠', low_stock: '▦', member_joined: '☺', daily_summary: '◔', reminder_sent: '✉' };

export default function Notifications() {
  const { org, base } = useOrg();
  const router = useRouter();
  const list = useApi(() => api(`/orgs/${org.id}/notifications`, { query: { limit: 100 } }), [org.id]);
  async function open(n) {
    if (!n.read) await api(`/orgs/${org.id}/notifications/read`, { method: 'POST', body: { ids: [n.id] } }).catch(() => {});
    if (n.link) router.push(base + n.link); else list.reload();
  }
  async function readAll() { await api(`/orgs/${org.id}/notifications/read`, { method: 'POST', body: { all: true } }); list.reload(); window.dispatchEvent(new Event('notifications-changed')); }
  return (
    <>
      <PageHead title="Notifications" sub="Cancelled bills, low stock, new members and the daily summary"
        actions={<><Link className="btn" href={`${base}/settings#notifications`}>Settings</Link>
          <button className="btn" onClick={readAll} disabled={!list.data?.unread}>Mark all read</button></>} />
      <div className="card">
        <ErrorNote error={list.error} />
        {list.loading && !list.data ? <Loading /> : list.data?.notifications.length === 0 ? <Empty>Nothing yet. You will be told here when a bill is cancelled, stock runs low, or someone joins.</Empty> : (
          <div>{list.data?.notifications.map((n) => (
            <button key={n.id} onClick={() => open(n)} className="row" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: '1px solid var(--line)', padding: '12px 4px', cursor: 'pointer', color: 'inherit', font: 'inherit', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <span style={{ fontSize: 18, width: 24 }}>{ICON[n.kind] ?? '•'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: n.read ? 500 : 800, color: 'var(--ink)', display: 'block' }}>{n.title}</span>
                {n.body && <span className="muted" style={{ display: 'block', fontSize: 14 }}>{n.body}</span>}
                <span className="muted" style={{ fontSize: 12 }}>{new Date(n.createdAt).toLocaleString('en-IN')}</span>
              </span>
              {!n.read && <span className="badge">new</span>}
            </button>
          ))}</div>
        )}
      </div>
    </>
  );
}
