'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const initialState = {
  products: [],
  purchases: [],
  sales: [],
  adjustments: [],
  expenses: [],
  invoices: [],
  invoiceItems: [],
};

const navItems = ['overview', 'products', 'inventory', 'purchases', 'sales', 'invoices', 'adjustments', 'expenses'];

const indianStates = [
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR',
  'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB',
  'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UK', 'UP', 'WB',
];

const ocrNoiseTokens = ['invoice', 'bill', 'gstin', 'cgst', 'sgst', 'igst', 'subtotal', 'total', 'amount', 'tax', 'date'];

function parseDigitizedLinesFromRawText(rawText) {
  const candidates = String(rawText || '')
    .split('\n')
    .map((line) => line.replace(/₹/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const output = [];

  for (const line of candidates) {
    const lower = line.toLowerCase();
    if (ocrNoiseTokens.some((token) => lower.includes(token))) continue;

    const firstNumberMatch = line.match(/\d/);
    if (!firstNumberMatch || firstNumberMatch.index === undefined) continue;

    const numericMatches = [...line.matchAll(/\d+(?:\.\d+)?/g)];
    if (numericMatches.length < 2) continue;

    const name = line.slice(0, firstNumberMatch.index).replace(/[|:\-]+$/g, '').trim();
    if (!name || name.length < 2) continue;

    const qty = Number(numericMatches[0][0]);
    const rate = Number(numericMatches[1][0]);

    if (!Number.isInteger(qty) || qty <= 0) continue;
    if (!Number.isFinite(rate) || rate < 0) continue;

    const extraNumbers = numericMatches.slice(2).map((m) => Number(m[0]));
    const gstRate = extraNumbers.find((n) => Number.isFinite(n) && n >= 0 && n <= 28) ?? 0;
    const hsnCandidate = [...line.matchAll(/\b\d{4,8}\b/g)].map((m) => m[0]).find((x) => x !== String(qty));

    output.push(`${name},${qty},${rate},${gstRate},${hsnCandidate || ''}`);
  }

  const unique = [...new Set(output)];
  return unique.join('\n');
}

export default function Page() {
  const [state, setState] = useState(initialState);
  const [activeView, setActiveView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [invoiceLines, setInvoiceLines] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState('');
  const [menuInvoiceId, setMenuInvoiceId] = useState('');
  const [editingInvoiceId, setEditingInvoiceId] = useState('');
  const invoiceFormRef = useRef(null);

  useEffect(() => {
    fetchBootstrap();
  }, []);

  async function fetchBootstrap() {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/bootstrap');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to load data');
      setState(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function requestJson(endpoint, payload, method = 'POST') {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Request failed');
    }
    return body;
  }

  async function post(endpoint, payload) {
    await requestJson(endpoint, payload, 'POST');
    await fetchBootstrap();
  }

  const totals = useMemo(() => {
    const inventoryValue = state.products.reduce((sum, p) => sum + p.stock * p.cost, 0);
    const revenue = state.sales.reduce((sum, s) => sum + s.quantity * s.price, 0);
    const purchases = state.purchases.reduce((sum, p) => sum + p.quantity * p.cost, 0);
    const expenses = state.expenses.reduce((sum, e) => sum + e.amount, 0);
    const lowStock = state.products.filter((p) => p.stock <= p.minStock).length;
    return { inventoryValue, revenue, purchases, expenses, lowStock, profitable: revenue - purchases - expenses };
  }, [state]);

  const filteredProducts = useMemo(() => {
    const query = productFilter.trim().toLowerCase();
    return state.products.filter((product) => {
      if (!query) return true;
      return [product.name, product.category, product.sku, product.supplier].join(' ').toLowerCase().includes(query);
    });
  }, [productFilter, state.products]);

  const filteredInventory = useMemo(() => {
    return state.products.filter((product) => {
      if (stockFilter === 'low') return product.stock <= product.minStock;
      if (stockFilter === 'healthy') return product.stock > product.minStock;
      return true;
    });
  }, [state.products, stockFilter]);

  const invoiceItemsById = useMemo(() => {
    return state.invoiceItems.reduce((acc, item) => {
      if (!acc[item.invoiceId]) acc[item.invoiceId] = [];
      acc[item.invoiceId].push(item);
      return acc;
    }, {});
  }, [state.invoiceItems]);

  const alerts = useMemo(() => {
    const lowStock = state.products.filter((p) => p.stock <= p.minStock);
    if (!state.products.length) {
      return [{ title: 'No products yet', text: 'Add your first product to start tracking stock.' }];
    }
    if (!lowStock.length) {
      return [{ title: 'All clear', text: 'No low-stock items right now.' }];
    }
    return [
      {
        title: `${lowStock.length} low-stock item${lowStock.length > 1 ? 's' : ''}`,
        text: lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock})`).join(', '),
      },
    ];
  }, [state.products]);

  const productOptions = state.products.map((product) => (
    <option key={product.id} value={product.id}>
      {product.name} ({product.sku})
    </option>
  ));

  async function submitProduct(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await post('/api/products', {
      name: String(fd.get('name')).trim(),
      category: String(fd.get('category')).trim(),
      sku: String(fd.get('sku')).trim(),
      cost: Number(fd.get('cost')),
      price: Number(fd.get('price')),
      gstRate: Number(fd.get('gstRate')),
      hsnCode: String(fd.get('hsnCode') || '').trim(),
      stock: Number(fd.get('stock')),
      minStock: Number(fd.get('minStock')),
      supplier: String(fd.get('supplier') || '').trim(),
    });
    event.currentTarget.reset();
  }

  async function submitPurchase(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await post('/api/purchases', {
      productId: fd.get('productId'),
      quantity: Number(fd.get('quantity')),
      cost: Number(fd.get('cost')),
      reference: String(fd.get('reference') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    });
    event.currentTarget.reset();
  }

  async function submitSale(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await post('/api/sales', {
      productId: fd.get('productId'),
      quantity: Number(fd.get('quantity')),
      price: Number(fd.get('price')),
      channel: String(fd.get('channel') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    });
    event.currentTarget.reset();
  }

  async function submitAdjustment(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await post('/api/adjustments', {
      productId: fd.get('productId'),
      delta: Number(fd.get('delta')),
      reason: String(fd.get('reason') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    });
    event.currentTarget.reset();
  }

  async function submitExpense(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await post('/api/expenses', {
      label: String(fd.get('label')).trim(),
      category: String(fd.get('category')).trim(),
      amount: Number(fd.get('amount')),
      notes: String(fd.get('notes') || '').trim(),
    });
    event.currentTarget.reset();
  }

  async function submitInvoice(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const payload = {
      invoiceNumber: String(fd.get('invoiceNumber')).trim(),
      invoiceDate: fd.get('invoiceDate') ? new Date(String(fd.get('invoiceDate'))).toISOString() : new Date().toISOString(),
      customerName: String(fd.get('customerName') || '').trim(),
      customerPhone: String(fd.get('customerPhone') || '').trim(),
      customerGstin: String(fd.get('customerGstin') || '').trim(),
      paymentMode: String(fd.get('paymentMode') || '').trim(),
      placeOfSupplyCode: String(fd.get('placeOfSupplyCode') || 'MH').trim().toUpperCase(),
      notes: String(fd.get('notes') || '').trim(),
      linesText: invoiceLines.trim(),
      source: 'digitized',
      affectStock: fd.get('affectStock') === 'on',
    };

    if (editingInvoiceId) {
      await requestJson(`/api/invoices?invoiceId=${editingInvoiceId}`, payload, 'PATCH');
      await fetchBootstrap();
    } else {
      await post('/api/invoices', payload);
    }

    event.currentTarget.reset();
    setInvoiceLines('');
    setOcrMessage('');
    setEditingInvoiceId('');
    setMenuInvoiceId('');
  }

  function linesFromInvoice(invoiceId) {
    return (invoiceItemsById[invoiceId] || [])
      .map((item) => `${item.productName},${item.quantity},${item.rate},${item.gstRate},${item.hsnCode || ''}`)
      .join('\n');
  }

  function loadInvoiceInForm(invoice, options = {}) {
    const form = invoiceFormRef.current;
    if (!form) return;

    const dateValue = new Date(invoice.invoiceDate).toISOString().slice(0, 10);
    form.invoiceNumber.value = options.invoiceNumber || invoice.invoiceNumber;
    form.invoiceDate.value = dateValue;
    form.customerName.value = invoice.customerName || '';
    form.customerPhone.value = invoice.customerPhone || '';
    form.customerGstin.value = invoice.customerGstin || '';
    form.paymentMode.value = invoice.paymentMode || '';
    form.placeOfSupplyCode.value = invoice.placeOfSupplyCode || 'MH';
    form.notes.value = invoice.notes || '';

    setInvoiceLines(linesFromInvoice(invoice.id));
    setActiveView('invoices');
    setEditingInvoiceId(options.editing ? invoice.id : '');
    setMenuInvoiceId('');
    setOcrMessage(options.message || '');
  }

  function duplicateInvoice(invoice) {
    loadInvoiceInForm(invoice, {
      editing: false,
      invoiceNumber: `${invoice.invoiceNumber}-COPY`,
      message: 'Invoice loaded as template. Update number/date and submit as new.',
    });
  }

  function startInvoiceEdit(invoice) {
    loadInvoiceInForm(invoice, {
      editing: true,
      message: 'Editing mode active. Submit to update this invoice.',
    });
  }

  async function deleteInvoice(invoice) {
    const confirmed = window.confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`);
    if (!confirmed) return;

    await requestJson(`/api/invoices?invoiceId=${invoice.id}`, undefined, 'DELETE');
    await fetchBootstrap();
    setMenuInvoiceId('');

    if (editingInvoiceId === invoice.id) {
      setEditingInvoiceId('');
      setInvoiceLines('');
      setOcrMessage('');
      if (invoiceFormRef.current) invoiceFormRef.current.reset();
    }
  }

  function printInvoice(invoice) {
    const items = invoiceItemsById[invoice.id] || [];
    const rows = items
      .map((item) => `<tr><td>${item.productName}</td><td>${item.quantity}</td><td>${item.rate}</td><td>${item.gstRate}%</td><td>${item.lineTotal}</td></tr>`)
      .join('');

    const win = window.open('', '_blank', 'width=960,height=700');
    if (!win) return;

    win.document.write(`
      <html>
        <head>
          <title>Invoice ${invoice.invoiceNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          </style>
        </head>
        <body>
          <h2>Invoice ${invoice.invoiceNumber}</h2>
          <p>Date: ${dateFormatter.format(new Date(invoice.invoiceDate))}</p>
          <p>Customer: ${invoice.customerName || '-'}</p>
          <p>GSTIN: ${invoice.customerGstin || '-'}</p>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>GST</th><th>Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <h3 style="margin-top: 16px;">Total: ${currency.format(invoice.totalAmount)}</h3>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  async function extractTextFromPdf(file) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    let text = '';

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }

    return text;
  }

  async function onInvoiceFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setOcrLoading(true);
      setOcrMessage('Reading invoice file...');

      let rawText = '';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        rawText = await extractTextFromPdf(file);
      } else {
        const Tesseract = await import('tesseract.js');
        const result = await Tesseract.recognize(file, 'eng');
        rawText = result?.data?.text || '';
      }

      const parsed = parseDigitizedLinesFromRawText(rawText);
      if (!parsed) {
        setOcrMessage('Could not detect line items automatically. Please paste lines manually.');
        return;
      }

      setInvoiceLines((prev) => (prev.trim() ? `${prev}\n${parsed}` : parsed));
      const count = parsed.split('\n').filter(Boolean).length;
      setOcrMessage(`Imported ${count} item line${count > 1 ? 's' : ''}. Review and submit.`);
    } catch (ocrError) {
      setOcrMessage('Failed to read file. Try a clearer image or enter lines manually.');
    } finally {
      setOcrLoading(false);
      event.target.value = '';
    }
  }

  const salesCount = state.sales.length;
  const purchaseCount = state.purchases.length;
  const productCount = state.products.length;
  const totalStock = state.products.reduce((sum, p) => sum + p.stock, 0);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <p className="eyebrow">Shop management</p>
            <h1>Bharat Shop App</h1>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <button key={item} className={`nav-item ${activeView === item ? 'active' : ''}`} onClick={() => setActiveView(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <section className="sidebar-card">
          <p className="eyebrow">Today</p>
          <div className="sidebar-date">{dateFormatter.format(new Date())}</div>
          <p className="sidebar-copy">Track kirana stock, purchases, sales and expenses from one dashboard.</p>
          {loading ? <p className="sidebar-copy">Loading...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <p className="eyebrow">Next.js + PostgreSQL</p>
            <h2>Built for Indian shops and kirana workflows.</h2>
            <p className="hero-copy">Fast UI with App Router and API routes, localized in INR with GST and HSN-ready product entries.</p>
          </div>
        </header>

        <section className="stats-grid">
          <article className="stat-card">
            <p className="eyebrow">Inventory value</p>
            <div className="stat-value">{currency.format(totals.inventoryValue)}</div>
            <div className="stat-delta">{totalStock} units on hand</div>
          </article>
          <article className="stat-card">
            <p className="eyebrow">Revenue</p>
            <div className="stat-value">{currency.format(totals.revenue)}</div>
            <div className="stat-delta">{salesCount} sales recorded</div>
          </article>
          <article className="stat-card">
            <p className="eyebrow">Purchases</p>
            <div className="stat-value">{currency.format(totals.purchases)}</div>
            <div className="stat-delta">{purchaseCount} stock buys</div>
          </article>
          <article className="stat-card">
            <p className="eyebrow">Low stock items</p>
            <div className="stat-value">{totals.lowStock}</div>
            <div className="stat-delta">{productCount} products tracked</div>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel wide">
            {activeView === 'overview' ? (
              <div className="view active-view">
                <div className="insights-card">
                  <h4>Live insights</h4>
                  <ul className="insight-list">
                    <li className="insight-item"><p className="insight-title">Operating result: {currency.format(totals.profitable)}</p></li>
                    <li className="insight-item"><p className="insight-title">Gross margin before expenses: {currency.format(totals.revenue - totals.purchases)}</p></li>
                    <li className="insight-item"><p className="insight-title">Expenses tracked: {currency.format(totals.expenses)}</p></li>
                  </ul>
                </div>
              </div>
            ) : null}

            {activeView === 'products' ? (
              <div className="panel-subgrid">
                <form className="form-card" onSubmit={submitProduct}>
                  <h4>Add product</h4>
                  <label>Product name<input name="name" required /></label>
                  <label>Category<input name="category" required /></label>
                  <label>SKU<input name="sku" required /></label>
                  <div className="split-fields">
                    <label>Purchase price (₹)<input name="cost" type="number" step="0.01" min="0" required /></label>
                    <label>Selling price (₹)<input name="price" type="number" step="0.01" min="0" required /></label>
                  </div>
                  <div className="split-fields">
                    <label>GST %<input name="gstRate" type="number" step="0.01" min="0" max="28" defaultValue="0" required /></label>
                    <label>HSN/SAC code<input name="hsnCode" placeholder="e.g. 1006" /></label>
                  </div>
                  <div className="split-fields">
                    <label>Opening stock<input name="stock" type="number" step="1" min="0" required /></label>
                    <label>Reorder level<input name="minStock" type="number" step="1" min="0" required /></label>
                  </div>
                  <label>Supplier<input name="supplier" /></label>
                  <button className="primary-button" type="submit">Save product</button>
                </form>
                <div className="table-card">
                  <div className="table-header">
                    <h4>Products</h4>
                    <input className="search-input" placeholder="Search products" value={productFilter} onChange={(e) => setProductFilter(e.target.value)} />
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Product</th><th>Category</th><th>SKU</th><th>HSN</th><th>Stock</th><th>Pricing</th></tr></thead>
                      <tbody>
                        {filteredProducts.map((p) => (
                          <tr key={p.id}><td>{p.name}</td><td>{p.category}</td><td>{p.sku}</td><td>{p.hsnCode || '-'}</td><td>{p.stock}</td><td>{currency.format(p.cost)} / {currency.format(p.price)} ({p.gstRate}% GST)</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {activeView === 'inventory' ? (
              <div className="table-card">
                <div className="table-header">
                  <h4>Inventory health</h4>
                  <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
                    <option value="all">All stock</option>
                    <option value="low">Low stock</option>
                    <option value="healthy">Healthy stock</option>
                  </select>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Item</th><th>On hand</th><th>Reorder</th><th>Value</th></tr></thead>
                    <tbody>
                      {filteredInventory.map((p) => (
                        <tr key={p.id}><td>{p.name}</td><td>{p.stock}</td><td>{p.minStock}</td><td>{currency.format(p.stock * p.cost)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {activeView === 'purchases' ? (
              <div className="panel-subgrid">
                <form className="form-card" onSubmit={submitPurchase}>
                  <h4>Record purchase</h4>
                  <label>Product<select name="productId" required>{productOptions}</select></label>
                  <div className="split-fields">
                    <label>Quantity<input name="quantity" type="number" min="1" required /></label>
                    <label>Cost per unit<input name="cost" type="number" step="0.01" min="0" required /></label>
                  </div>
                  <label>Reference<input name="reference" /></label>
                  <label>Notes<textarea name="notes" rows="3" /></label>
                  <button className="primary-button" type="submit">Add purchase</button>
                </form>
                <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Total</th></tr></thead><tbody>{state.purchases.map((x) => <tr key={x.id}><td>{dateFormatter.format(new Date(x.date))}</td><td>{state.products.find((p) => p.id === x.productId)?.name || 'Unknown'}</td><td>{x.quantity}</td><td>{currency.format(x.quantity * x.cost)}</td></tr>)}</tbody></table></div></div>
              </div>
            ) : null}

            {activeView === 'sales' ? (
              <div className="panel-subgrid">
                <form className="form-card" onSubmit={submitSale}>
                  <h4>Record sale</h4>
                  <label>Product<select name="productId" required>{productOptions}</select></label>
                  <div className="split-fields">
                    <label>Quantity<input name="quantity" type="number" min="1" required /></label>
                    <label>Sale price<input name="price" type="number" step="0.01" min="0" required /></label>
                  </div>
                  <label>Channel<input name="channel" placeholder="UPI / Cash / Card" /></label>
                  <label>Notes<textarea name="notes" rows="3" /></label>
                  <button className="primary-button" type="submit">Add sale</button>
                </form>
                <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead><tbody>{state.sales.map((x) => <tr key={x.id}><td>{dateFormatter.format(new Date(x.date))}</td><td>{state.products.find((p) => p.id === x.productId)?.name || 'Unknown'}</td><td>{x.quantity}</td><td>{currency.format(x.quantity * x.price)}</td></tr>)}</tbody></table></div></div>
              </div>
            ) : null}

            {activeView === 'invoices' ? (
              <div className="panel-subgrid">
                <form className="form-card" onSubmit={submitInvoice} ref={invoiceFormRef}>
                  <h4>Digitize old invoice</h4>
                  {editingInvoiceId ? <div className="form-note">Editing existing invoice</div> : null}
                  <div className="split-fields">
                    <label>Invoice number<input name="invoiceNumber" placeholder="e.g. 24-25/0191" required /></label>
                    <label>Invoice date<input name="invoiceDate" type="date" required /></label>
                  </div>
                  <div className="split-fields">
                    <label>Customer name<input name="customerName" placeholder="Optional" /></label>
                    <label>Customer phone<input name="customerPhone" placeholder="Optional" /></label>
                  </div>
                  <div className="split-fields">
                    <label>Customer GSTIN<input name="customerGstin" placeholder="Optional" /></label>
                    <label>Payment mode<input name="paymentMode" placeholder="UPI / Cash / Card" /></label>
                  </div>
                  <label>Place of supply state code
                    <select name="placeOfSupplyCode" defaultValue="MH">
                      {indianStates.map((code) => <option key={code} value={code}>{code}</option>)}
                    </select>
                  </label>
                  <label>Item lines (one per line)
                    <div className="upload-stack">
                      <input
                        type="file"
                        accept="image/*,.pdf,application/pdf"
                        onChange={onInvoiceFileSelected}
                      />
                      <div className="upload-help">
                        {ocrLoading ? 'Processing file for OCR...' : 'Upload old invoice image/PDF to auto-fill lines'}
                      </div>
                      {ocrMessage ? <div className="upload-help">{ocrMessage}</div> : null}
                    </div>
                    <textarea
                      name="linesText"
                      rows="7"
                      required
                      value={invoiceLines}
                      onChange={(e) => setInvoiceLines(e.target.value)}
                      placeholder={[
                        'Basmati Rice 5kg,2,520,5,1006',
                        'Detergent Powder 1kg,1,92,18,3402',
                        'Format: item,qty,rate,gst%,hsn(optional)'
                      ].join('\n')}
                    />
                  </label>
                  <label>Notes<textarea name="notes" rows="2" placeholder="Legacy bill details / remarks" /></label>
                  <label className="checkbox-line"><input name="affectStock" type="checkbox" />Also reduce stock for this imported invoice</label>
                  <div className="split-fields">
                    <button className="primary-button" type="submit">{editingInvoiceId ? 'Update invoice' : 'Digitize invoice'}</button>
                    {editingInvoiceId ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setEditingInvoiceId('');
                          setInvoiceLines('');
                          setOcrMessage('');
                          if (invoiceFormRef.current) invoiceFormRef.current.reset();
                        }}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                </form>
                <div className="table-card">
                  <div className="table-header">
                    <h4>Invoice register (GST-ready)</h4>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Tax split</th><th>Total</th><th>More</th></tr></thead>
                      <tbody>
                        {state.invoices.map((x) => (
                          <tr key={x.id}>
                            <td>{dateFormatter.format(new Date(x.invoiceDate))}</td>
                            <td>{x.invoiceNumber}<br />{x.placeOfSupplyCode}{x.isInterstate ? ' (IGST)' : ' (CGST+SGST)'}</td>
                            <td>{x.customerName || '-'}<br />{x.customerGstin || '-'}</td>
                            <td>
                              {x.isInterstate
                                ? `IGST ${currency.format(x.igstAmount)}`
                                : `CGST ${currency.format(x.cgstAmount)} + SGST ${currency.format(x.sgstAmount)}`}
                            </td>
                            <td>{currency.format(x.totalAmount)}</td>
                            <td>
                              <div className="menu-wrap">
                                <button className="menu-trigger" onClick={() => setMenuInvoiceId(menuInvoiceId === x.id ? '' : x.id)} type="button">⋮</button>
                                {menuInvoiceId === x.id ? (
                                  <div className="menu-card">
                                    <button type="button" onClick={() => startInvoiceEdit(x)}>Edit</button>
                                    <button type="button" onClick={() => duplicateInvoice(x)}>Duplicate</button>
                                    <button type="button" onClick={() => printInvoice(x)}>Print</button>
                                    <button type="button" onClick={() => deleteInvoice(x)}>Delete</button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {activeView === 'adjustments' ? (
              <div className="panel-subgrid">
                <form className="form-card" onSubmit={submitAdjustment}>
                  <h4>Stock adjustment</h4>
                  <label>Product<select name="productId" required>{productOptions}</select></label>
                  <div className="split-fields">
                    <label>Change in stock<input name="delta" type="number" step="1" required /></label>
                    <label>Reason<input name="reason" required /></label>
                  </div>
                  <label>Notes<textarea name="notes" rows="3" /></label>
                  <button className="primary-button" type="submit">Apply adjustment</button>
                </form>
                <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Change</th><th>Reason</th></tr></thead><tbody>{state.adjustments.map((x) => <tr key={x.id}><td>{dateFormatter.format(new Date(x.date))}</td><td>{state.products.find((p) => p.id === x.productId)?.name || 'Unknown'}</td><td>{x.delta}</td><td>{x.reason}</td></tr>)}</tbody></table></div></div>
              </div>
            ) : null}

            {activeView === 'expenses' ? (
              <div className="panel-subgrid">
                <form className="form-card" onSubmit={submitExpense}>
                  <h4>Record expense</h4>
                  <label>Label<input name="label" placeholder="Rent, electricity, staff" required /></label>
                  <div className="split-fields">
                    <label>Category<input name="category" required /></label>
                    <label>Amount<input name="amount" type="number" step="0.01" min="0" required /></label>
                  </div>
                  <label>Notes<textarea name="notes" rows="3" /></label>
                  <button className="primary-button" type="submit">Add expense</button>
                </form>
                <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Date</th><th>Label</th><th>Category</th><th>Amount</th></tr></thead><tbody>{state.expenses.map((x) => <tr key={x.id}><td>{dateFormatter.format(new Date(x.date))}</td><td>{x.label}</td><td>{x.category}</td><td>{currency.format(x.amount)}</td></tr>)}</tbody></table></div></div>
              </div>
            ) : null}
          </article>

          <aside className="panel side">
            <div className="panel-header"><h3>Alerts</h3></div>
            <div className="alert-list">
              {alerts.map((alert, index) => (
                <article className="alert-item" key={index}>
                  <h4 className="alert-title">{alert.title}</h4>
                  <div className="alert-text">{alert.text}</div>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
