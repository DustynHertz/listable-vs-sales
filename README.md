# Listable vs Sales

Sales ops dashboard that compares inventory put-away (stored to listable) with sell-through. Upload two Excel/CSV extracts; the server parses them, stages into Postgres, and commits in a single transaction.

The UI is a single page with three tabs — **Executive**, **Data - Units**, and **Category - Units** — plus a header filter bar that every metric honors.

## Run with Docker

```bash
docker compose up --build
```

Open [http://localhost:43123](http://localhost:43123). Postgres is on host port **5433**.

## Run locally (Node + Postgres)

Requires Node 22+ and Postgres 16.

```bash
# create db once
createdb listable
# or:
# psql -c "CREATE USER listable WITH PASSWORD 'listable';"
# psql -c "CREATE DATABASE listable OWNER listable;"

cp api/.env.example api/.env
# edit DATABASE_URL if needed

npm install --prefix api
npm install --prefix web
npm test --prefix api
npm run dev --prefix api    # API on http://127.0.0.1:43124
npm run dev --prefix web    # UI on http://127.0.0.1:43123 (proxies /api)
```

Environment variables (API):

| Variable        | Default                                                      | Purpose              |
| --------------- | ------------------------------------------------------------ | -------------------- |
| `DATABASE_URL`  | `postgres://listable:listable@127.0.0.1:5432/listable`       | Postgres connection  |
| `PORT`          | `43124`                                                      | API port             |

## Upload flow

1. Open the dashboard. Until a successful import exists, you see empty-state upload CTAs.
2. **Upload Stored to Listable** — `.xlsx` or `.csv` of the put-away extract (35–50 MB is expected; parsing is server-side).
3. **Upload Sold** — the sales extract. Sold-side columns overwrite **only** sold fields for matching `TRGID` values, including blanks. Listable fields are never touched.
4. Watch the progress dialog. On any failure the import is rolled back in full — no partial rows.
5. **Upload History** lists filename, type, committed row count, and timestamp.
6. **Clear All Data** (red outline) wipes inventory and history after confirm.

Sample files live in `sample-data/` (`stored-to-listable.csv`, `sold.csv`, plus a small `.xlsx`). Generate fresh copies with:

```bash
npm run generate:sample --prefix api
```

### What happens on import

- Headers match case-insensitively; spaces and underscores are ignored.
- Excel serial dates are converted; `$` and `,` are stripped from numbers.
- Blank `TRGID` rows are dropped.
- Duplicate `TRGID`s in one file keep the **last** row.
- `ProgramName` values `BRTON-LENOVO-DC-400`, `BRTON-LENOVO-DC-402`, `DS-MONTERREY`, and `DS-MERCORP` are dropped.
- `MILON-WM-DOTCA-RTV` is rewritten to `BRTON-WM-DOTCA-RTV`.
- `Facility` is the program prefix before the first hyphen, uppercased.

Rows match across files on `TRGID`. One item can have both a put-away side and a sold side.

## Filters

Every KPI, chart, and table uses the header bar:

- **Date range** — Yesterday (default), Last 7 Days, Last 30 Days, All Time, or custom. Inclusive UTC dates. Put-away uses `FirstStoredOnListableLocationOn`; sold uses `OrderCreatedDate`.
- **Facility**, **Master Program**, **Product Type** (default Non-RTV), **Order Type**, **Marketplace**.

Master programs `Walmart Computer Parts (Finished)`, `Walmart Computers Parts (Finished)`, `Walmart Finished Goods Wide Sku (Finished)`, `Walmart Headphones & Speakers (Not Apple) (Finished)`, and `Walmart Monitors (Finished)` display (and filter) as **Walmart Inspect and Sell (Finished)**.

## Definitions (short)

- **Sold** — `Sale Price (Discount applied) > 0`.
- **Listable / produced** — put-away row with `LocationNotListable = FALSE`.
- **Listable retail value** — lower of `MR_LMR_UPC_AverageCategoryRetail` and `UPCRetail` (whichever exists and is &gt; 0).
- **Retail basis (sold)** — `Retail Price On Sale Date` if &gt; 0; otherwise that same lower-of pair from the sold file.
- **Sell-Through %** — sold qty ÷ put-away qty (`—` when put-away is 0).
- **Recovery %** (Executive + Category) — sold GMV ÷ put-away GMV.
- **Unit recovery** (scorecard, Units) — average of sale ÷ retail basis on **loose** sold units.
- **Pallet recovery** (scorecard, Pallets) — same ratio by `LocationID`; rates above 150% are dropped from the **percentage only**.
- Pallet metrics require non-blank `SortingIndex` and `LocationID`, and exclude RTV, $0 sale, `The Recon Group LLP`, and `Sender Shamiss`. Those rows still count in total sold.
- **Data / Category** tabs are loose units only and always exclude RTV, `$0` sales, pallets, and programs `DS-MONTERREY`, `DS-MERCORP`, `MIAFL-HEAD-OFFICE`.

## Layout

```
/api    Express + TypeScript (parse, stage, metrics)
/web    React + TypeScript + Vite
```
