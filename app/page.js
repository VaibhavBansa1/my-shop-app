'use client';

import { useEffect, useMemo, useState } from 'react';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
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
};

const navItems = ['overview', 'products', 'inventory', 'purchases', 'sales', 'adjustments', 'expenses'];

export default function Page() {
  const [state, setState] = useState(initialState);
  const [activeView, setActiveView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('all');

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

  async function post(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Request failed');
    }
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
            <h1>My Shop App</h1>
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
          <p className="sidebar-copy">Track inventory, purchases, sales and expenses from one dashboard.</p>
          {loading ? <p className="sidebar-copy">Loading...</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <p className="eyebrow">Next.js + PostgreSQL</p>
            <h2>Shop operations with proper backend.</h2>
            <p className="hero-copy">Fast UI with App Router and API routes. All transactions persist in PostgreSQL.</p>
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
                    <label>Cost price<input name="cost" type="number" step="0.01" min="0" required /></label>
                    <label>Sale price<input name="price" type="number" step="0.01" min="0" required /></label>
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
                      <thead><tr><th>Product</th><th>Category</th><th>SKU</th><th>Stock</th><th>Pricing</th></tr></thead>
                      <tbody>
                        {filteredProducts.map((p) => (
                          <tr key={p.id}><td>{p.name}</td><td>{p.category}</td><td>{p.sku}</td><td>{p.stock}</td><td>{currency.format(p.cost)} / {currency.format(p.price)}</td></tr>
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
                  <label>Channel<input name="channel" /></label>
                  <label>Notes<textarea name="notes" rows="3" /></label>
                  <button className="primary-button" type="submit">Add sale</button>
                </form>
                <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead><tbody>{state.sales.map((x) => <tr key={x.id}><td>{dateFormatter.format(new Date(x.date))}</td><td>{state.products.find((p) => p.id === x.productId)?.name || 'Unknown'}</td><td>{x.quantity}</td><td>{currency.format(x.quantity * x.price)}</td></tr>)}</tbody></table></div></div>
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
                  <label>Label<input name="label" required /></label>
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
