# my-shop-app

Next.js + PostgreSQL shop management app for Indian shops to track products, inventory, purchases, sales, adjustments, and expenses.

## Stack

- Next.js App Router
- PostgreSQL via pg
- Responsive custom UI
- INR currency and Indian date formatting
- GST % and HSN/SAC support in product catalog
- GST-ready invoice register with CGST/SGST/IGST split
- Old invoice digitization by pasting invoice lines
- OCR-assisted old invoice import from image or PDF files

## Run locally

1. Install dependencies.

```bash
npm install
```

2. Create a PostgreSQL database and set DATABASE_URL.

```bash
export DATABASE_URL="postgres://user:password@localhost:5432/my_shop_app"
```

### Start PostgreSQL (if not running)

Use either Docker (recommended in dev containers) or local Ubuntu service.

Option 1: Docker

```bash
docker run --name myshop-postgres \
	-e POSTGRES_USER=shop \
		-e POSTGRES_PASSWORD=shop \
			-e POSTGRES_DB=my_shop_app \
				-p 5432:5432 \
					-d postgres:16
```

Check status:

```bash
docker ps
docker exec -it myshop-postgres pg_isready -U shop -d my_shop_app
```

Option 2: Ubuntu service (when PostgreSQL is installed locally)

```bash
sudo service postgresql start
sudo service postgresql status
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
- You can upload a scanned bill image or PDF in `Invoices` tab; detected rows are auto-filled and can be edited before saving.
- Old bills can also be digitized manually with line format:

```text
item_name,quantity,rate,gst_percent,hsn_code(optional)
```