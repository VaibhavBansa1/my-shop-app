import Link from 'next/link';

export default function Home() {
  return (
    <div className="public">
      <header className="public-top">
        <Link className="brand" href="/"><span className="brand-mark">₹</span>My Shop App</Link>
        <div className="row">
          <Link className="btn" href="/login">Sign in</Link>
          <Link className="btn btn-primary" href="/signup">Create account</Link>
        </div>
      </header>
      <main>
        <section className="hero">
          <div>
            <h1>Billing, stock and accounts for your shop.</h1>
            <p className="lede">Make GST invoices, track stock and see your profit, on your phone or computer.
              Set up your business in a minute, add your staff, and keep your books in a private, secure space.</p>
            <div className="row" style={{ marginTop: 22 }}>
              <Link className="btn btn-primary" href="/signup">Start free</Link>
              <Link className="btn" href="/login">I already have an account</Link>
            </div>
          </div>
        </section>
        <section className="features">
          <div className="card"><h2>Billing with GST</h2><p className="muted">Sales and purchase invoices with CGST, SGST or IGST worked out for you, ready to print or share.</p></div>
          <div className="card"><h2>Stock that stays right</h2><p className="muted">Every sale and purchase moves stock automatically. See low-stock items and stock value at a glance.</p></div>
          <div className="card"><h2>Real accounts</h2><p className="muted">Double-entry books like Tally: day book, ledgers, trial balance, profit &amp; loss and balance sheet.</p></div>
          <div className="card"><h2>Your team, your rules</h2><p className="muted">Invite staff as cashier, accountant, admin or viewer. Each role sees and does only what it should.</p></div>
          <div className="card"><h2>Private by design</h2><p className="muted">Every business is isolated at the database level. Posted entries can’t be silently edited, and every change is logged.</p></div>
          <div className="card"><h2>Works anywhere</h2><p className="muted">Runs in any browser on phone, tablet or computer. Native apps can use the same secure API.</p></div>
        </section>
      </main>
    </div>
  );
}
