'use client';
import { use } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '../../ui/api.js';
import { useApi, Loading, ErrorNote } from '../../ui/components.js';
import { OrgContext } from '../../ui/OrgContext.js';
import { ROLE_LABEL } from '../../ui/format.js';

const NAV = [
  { href: '', label: 'Home', ico: '⌂' },
  { href: '/vouchers/new?type=sales', label: 'New sale', ico: '＋', match: '/vouchers/new' },
  { href: '/vouchers', label: 'Vouchers', ico: '≡' },
  { href: '/items', label: 'Stock', ico: '▦' },
  { href: '/ledgers', label: 'Parties & ledgers', short: 'Ledgers', ico: '☰' },
  { href: '/reports', label: 'Reports', ico: '◔' },
  { sep: true },
  { href: '/team', label: 'Team', ico: '☺', perm: 'members.read' },
  { href: '/settings', label: 'Settings', ico: '⚙' },
];
const TABS = ['', '/vouchers/new?type=sales', '/vouchers', '/items', '/reports'];

export default function OrgLayout({ children, params }) {
  const { orgId } = use(params);
  const path = usePathname();
  const org = useApi(() => api(`/orgs/${orgId}`), [orgId]);
  if (org.loading && !org.data) return <Loading />;
  if (org.error) return <div className="auth-box"><ErrorNote error={org.error} /><Link href="/orgs">Back to your businesses</Link></div>;
  const base = `/o/${orgId}`;
  const o = org.data;
  const can = (a) => o.permissions.includes(a);
  const isActive = (n) => {
    const target = base + (n.match ?? n.href.split('?')[0]);
    return n.href === '' ? path === base : path === target || (path.startsWith(`${target}/`) && !(n.href === '/vouchers' && path.startsWith(`${base}/vouchers/new`)));
  };
  return (
    <OrgContext.Provider value={{ org: o, base, can, reloadOrg: org.reload }}>
      <div className="shell">
        <aside className="side">
          <Link className="brand" href="/orgs"><span className="brand-mark">₹</span>My Shop App</Link>
          <Link className="org-switch" href="/orgs">{o.name}<small>{ROLE_LABEL[o.role]} · switch</small></Link>
          <nav className="nav" aria-label="Main">
            {NAV.filter((n) => !n.perm || can(n.perm)).map((n, i) => n.sep ? <div key={i} className="nav-sep" /> : (
              <Link key={n.href} href={base + n.href} className={isActive(n) ? 'active' : ''}>{n.ico} {n.label}</Link>
            ))}
          </nav>
        </aside>
        <main className="main">
          <div className="mobile-top no-print">
            <Link className="brand" href="/orgs"><span className="brand-mark">₹</span><span style={{ maxWidth: '55vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span></Link>
            <div className="row"><Link className="btn btn-sm" href={`${base}/ledgers`}>Ledgers</Link><Link className="btn btn-sm" href={`${base}/settings`}>⚙</Link></div>
          </div>
          {children}
        </main>
        <nav className="tabbar" aria-label="Main">
          {TABS.map((h) => NAV.find((n) => n.href === h)).map((n) => (
            <Link key={n.href} href={base + n.href} className={isActive(n) ? 'active' : ''}><span className="ico">{n.ico}</span>{n.short ?? n.label}</Link>
          ))}
        </nav>
      </div>
    </OrgContext.Provider>
  );
}
