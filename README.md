# Delisle Mowing Co. — Business Tracker

A free, offline-first web app (PWA) for tracking clients, contracts, invoices/payments (AR),
expenses, and budgets — plus a Python script that turns the app's exports into an Excel
workbook for bookkeeping and purchase decisions.

**How the data flows:**

```
His iPhone (the record)                    Finlay's PC
┌──────────────────────┐    JSON file     ┌──────────────────────────┐
│  PWA (this repo)     │ ──────────────►  │  import_to_excel.py      │
│  data in IndexedDB,  │  AirDrop/email/  │  builds/updates          │
│  never uploaded      │  OneDrive        │  DMC_Books.xlsx          │
└──────────────────────┘                  └──────────────────────────┘
```

**Privacy model:** GitHub only ever hosts the app's *code*. All business data lives in the
browser's IndexedDB on his phone. The app makes zero network calls with data in them.
Data leaves the device only when he taps **Settings → Export data** and shares the file.
The `.gitignore` blocks export files and the workbook from ever being committed.

---

## 1. One-time setup (Finlay)

### Deploy the app to GitHub Pages

1. Create a GitHub repo (private repos work with Pages on paid plans; a public repo is
   fine — it contains only code).
2. From this folder:
   ```
   git init
   git add .
   git commit -m "DMC tracker v1.0.0"
   git branch -M main
   git remote add origin https://github.com/<you>/dmc-tracker.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main`,
   folder: `/ (root)`** — then the app URL is
   `https://<you>.github.io/dmc-tracker/app/`.
   (Or set the Pages folder to serve only `app/` via an Actions workflow later; the
   simple root deploy works because the app uses relative paths.)
4. Open the URL once to confirm it loads.

### Install Python requirements (for the Excel script)

```
pip install openpyxl
```

## 2. One-time setup (him, on his iPhone)

1. Open the app URL in **Safari**.
2. Tap **Share → Add to Home Screen**. This matters for two reasons:
   * it makes the app full-screen like a native app, and
   * installed web apps are exempt from Safari's automatic data cleanup.
3. Open it from the Home Screen icon from then on. It works fully offline after the
   first load.

## 3. Everyday use (him)

* **Clients tab** — add clients (an optional contract form opens right after); tap a
  client to manage contracts. On per-visit contracts, tap **✓ Log visit today** each
  time the work is done — 5 seconds in the driveway.
* **Billing is semi-automatic** — the Home tab shows a **Ready to bill** section:
  per-visit contracts are billed from actual logged visits once the month ends,
  monthly contracts suggest themselves on the 1st, seasonal/one-time contracts once
  they start. One tap creates a **draft** invoice; he reviews and hits
  **✓ Approve & send** in the Money tab (drafts never count in AR until approved).
  Suggestions can be dismissed with ✕ if something shouldn't be billed.
* **Money tab** — drafts to approve, plus manual invoices any time (picking a contract
  pre-fills the price) and payment recording. Balances, status, and overdue aging are
  always computed, never typed.
* **Expenses tab** — log every expense with a category and a *mowing / plowing / general*
  tag. Set monthly or seasonal budget limits and watch actual-vs-budget bars.
* **Schedule tab** — set "Repeats" (weekly / every 2 or 4 weeks) + a "next visit" date on
  any contract and its jobs generate automatically; add one-time jobs freely. Rolling
  agenda (with month-calendar toggle), missed work pinned under "Catch up", and every
  job has Done / Move / Skip. **✓ Done on mowing/plowing work logs the visit for
  billing in the same tap.**
* **Crew (Clients tab → Crew)** — add whoever helps out (default $/hr rate). Log shifts
  as hours × rate or a flat amount, optionally tied to the client worked on. The app
  tracks what he OWES each person; **Pay out** settles the shifts and books one Wages
  expense automatically. Home shows "You owe Kevin $140" until he does.
  *Note for Finlay: these are informal cash wages — worth advising him on CRA rules
  (T4A/payroll thresholds) once helpers become regular.*
* **Business insights (Home tab)** — 📊 Insights: monthly cash flow, mowing vs plowing
  P&L including labour, labour % of revenue, revenue per visit, quote win rate.
  💪 Hiring power: what-if calculator showing what a helper costs per month vs his real
  average profit, and how many extra visits/week one must enable to break even.
* **Home tab** — the alert center: overdue invoices, contracts about to end, categories
  over budget, and backup reminders. (iPhone can't show notifications from a closed web
  app, so alerts appear here whenever he opens it.)
* **Settings → Export data** (every week or two, and before any phone change):
  shares a `dmc-export-YYYY-MM-DD.json` file to Finlay via AirDrop / email / OneDrive.
  The same file is his backup — **Restore from file** reloads it completely.

## 4. Updating the Excel workbook (Finlay)

```
python scripts/import_to_excel.py path\to\dmc-export-2026-08-24.json
```

* Creates `DMC_Books.xlsx` in the current folder on first run, updates it after.
* Importing the same file twice is safe — records are merged by their UUID and the
  newest version wins. No duplicates.
* If he deleted records in the app and you want the workbook to match exactly, run with
  `--replace` (raw sheets become an exact snapshot of that export).
* Close the workbook in Excel before running, or the save will fail.

**Workbook tabs:**

| Tab | What it is |
|---|---|
| Summary | Monthly cash P&L, revenue/expenses/net **by service line** (the snowplow-decision view), headline stats |
| AR Aging | Per-client aging buckets + every open invoice with days past due |
| Budget vs Actual | Current period budget performance + expenses by category × month |
| Clients / Contracts / Invoices / Payments / Visits / Expenses / Budgets | Raw merged data (the accounting dataset; Visits backs up every invoice with proof of work) |

## 5. Shipping an app update (Finlay)

1. Edit the code in `app/`.
2. Bump the version in **two places**: `VERSION` at the top of `app/sw.js` and
   `APP_VERSION` in `app/js/app.js`.
3. Commit and push. Within a minute GitHub Pages serves the new version.
4. Next time he opens the app online, he gets an **"Update available — Refresh"** toast.
   His data is untouched by updates (it lives in IndexedDB, not in the app files).

## Folder layout

```
app/                    the PWA (deploy target)
scripts/import_to_excel.py   JSON export → DMC_Books.xlsx
```

## Safety notes

* **Never commit** export JSON files or `DMC_Books.xlsx` — `.gitignore` already blocks
  them, keep it that way.
* His iPhone passcode + iOS encryption protect the data at rest; the app adds a
  "back up your data" alert if no export has happened in 30 days.
* Restore replaces everything on the device — it asks for confirmation first.
