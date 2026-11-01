import { readFileSync } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import Markdown from '../ui/Markdown.js';

export const metadata = { title: 'Help' };
export const dynamic = 'force-dynamic';

const DOCS = { glossary: ['Glossary', 'GLOSSARY.md'], fields: ['Fields explained', 'FIELDS.md'] };

export default async function Help({ searchParams }) {
  const sp = await searchParams;
  const tab = Object.hasOwn(DOCS, sp?.tab) ? sp.tab : 'glossary';
  let source = '';
  try { source = readFileSync(path.join(process.cwd(), 'docs', DOCS[tab][1]), 'utf8'); } catch { source = '# Help\n\nThe help files are not available on this server.'; }
  return (
    <div className="public">
      <header className="public-top">
        <Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link>
        <Link className="btn btn-sm" href="/orgs">Back to the app</Link>
      </header>
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 48px', width: '100%' }}>
        <div className="chips">
          {Object.entries(DOCS).map(([k, [label]]) => <Link key={k} className={`chip ${k === tab ? 'active' : ''}`} href={`/help?tab=${k}`}>{label}</Link>)}
        </div>
        <div className="card"><Markdown source={source} /></div>
      </main>
    </div>
  );
}
