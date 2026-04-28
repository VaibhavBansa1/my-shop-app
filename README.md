# my-shop-app

Next.js + PostgreSQL shop management app for Indian shops to track products, inventory, purchases, sales, adjustments, and expenses.

## Stack

- Next.js App Router
- PostgreSQL via pg
- Responsive custom UI
- INR currency and Indian date formatting
- GST % and HSN/SAC support in product catalog

## Run locally

1. Install dependencies.

```bash
npm install
```

2. Create a PostgreSQL database and set DATABASE_URL.

```bash
export DATABASE_URL="postgres://user:password@localhost:5432/my_shop_app"
```

3. Start development server.

```bash
npm run dev
```

Open http://localhost:3000.

## Notes

- Tables are auto-created on first API call.
- Seed products are inserted when the products table is empty.
- Product records include `gst_rate` and `hsn_code` for GST-ready entries.