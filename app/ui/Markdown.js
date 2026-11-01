// Tiny Markdown renderer for our own docs (headings, paragraphs, lists, tables, bold, italics, code).
// Renders React elements only — no HTML injection path.
import { Fragment } from 'react';

function inline(text, key = 0) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0; let m; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) parts.push(<b key={`${key}-${i++}`}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) parts.push(<code key={`${key}-${i++}`} className="mono">{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) parts.push(<span key={`${key}-${i++}`}>{t.slice(1, t.indexOf(']'))}</span>);
    else parts.push(<i key={`${key}-${i++}`}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ source }) {
  const lines = source.replace(/\r/g, '').split('\n');
  const out = []; let i = 0; let k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim() || l.trim() === '---') { i++; continue; }
    if (l.startsWith('```')) { i++; const code = []; while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]); i++; out.push(<pre key={k++} className="card mono" style={{ overflowX: 'auto' }}>{code.join('\n')}</pre>); continue; }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) { const Tag = `h${h[1].length}`; out.push(<Tag key={k++} id={h[2].toLowerCase().replace(/[^a-z0-9]+/g, '-')} style={{ margin: '22px 0 8px' }}>{inline(h[2], k)}</Tag>); i++; continue; }
    if (l.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(<div key={k++} className="table-wrap"><table><thead><tr>{cells(head).map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr></thead>
        <tbody>{body.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j}>{inline(c, `${ri}-${j}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const items = []; while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      out.push(<ul key={k++}>{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ul>); continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#|\||```|\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={k++} style={{ margin: '8px 0' }}>{inline(para.join(' '), k)}</p>);
  }
  return <Fragment>{out}</Fragment>;
}
