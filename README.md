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
Data leaves the device only when he taps **Settings → Send to Finlay** and picks a
destination in the share sheet.
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

## 3. The tabs (v2.0)

`Today · Schedule · Clients · Crew · Money · Expenses`, plus a **gear in the top-right
corner for Settings** (it's the one screen that's never a driveway action).

## 4. Everyday use (him)

* **Today tab** — the screen he opens 20× a day. Today's jobs first, each with a big
  **✓ Done** button; missed work is flagged at the top. Then the alert centre (overdue
  invoices, contracts ending, over-budget categories, backup reminders — iPhone can't
  notify from a closed web app, so alerts live here). Then the big **Owed to you** card
  with aging, net-this-month, collected/spent/wages-owed/open-invoice stats, and
  **Ready to bill**.
* **Schedule tab** — set "Repeats" (weekly / every 2 or 4 weeks) + a "next visit" date on
  any contract and its jobs generate automatically; add one-time jobs freely. Rolling
  agenda (with month-calendar toggle), missed work pinned under "Catch up", and every
  job has Done / Assign / Move / Skip. **✓ Done on mowing/plowing work logs the visit for
  billing in the same tap.**
* **Clients tab** — add clients (an optional contract form opens right after); tap a
  client to manage contracts. On per-visit contracts, tap **✓ Log visit today** each
  time the work is done — 5 seconds in the driveway. Contracts also carry
  **"Usually done by"** so a crew member is assigned automatically every time.
* **Crew tab** — add whoever helps out (default $/hr rate). Log shifts as hours × rate or
  a flat amount; **Pay out** settles the shifts and books one Wages expense automatically.
  Each member's card shows what he owes them and how many jobs they're on this week, and
  their detail page lists **Their jobs** off the schedule.
  *Note for Finlay: these are informal cash wages — worth advising him on CRA rules
  (T4A/payroll thresholds) once helpers become regular.*
* **Crew delegation (new in v2.0)** — assign any scheduled job to a crew member (per job,
  or by default on the contract). Assigned jobs show that person's name on the schedule,
  and marking one **✓ Done** opens a pre-filled sheet to log *their shift* — so delegation
  feeds the wages he owes exactly the way Done already feeds billing. Reverting a Done
  deletes the auto-logged shift unless it's already been paid out.
* **Money tab** — three segments. **Invoices**: drafts to approve, manual invoices any
  time (picking a contract pre-fills the price), payment recording; balances, status and
  aging are always computed, never typed. **Quotes**: accepted quotes auto-create the
  client + contract. **Insights**: monthly cash-flow bars, mowing-vs-plowing P&L including
  labour, labour % of revenue, revenue per visit, quote win rate, and the **Hiring power**
  what-if calculator (what a helper costs per month vs his real average profit, and how
  many extra visits/week one must enable to break even).
* **Billing is semi-automatic** — the Today tab shows a **Ready to bill** section:
  per-visit contracts are billed from actual logged visits once the month ends,
  monthly contracts suggest themselves on the 1st, seasonal/one-time contracts once
  they start. One tap creates a **draft** invoice; he reviews and hits
  **✓ Approve & send** in the Money tab (drafts never count in AR until approved).
  Suggestions can be dismissed with ✕ if something shouldn't be billed.
* **Expenses tab** — log every expense with a category and a *mowing / plowing / general*
  tag. Set monthly or seasonal budget limits and watch actual-vs-budget bars. Mileage and
  equipment logs live here too.
* **Settings (gear, top-right) → Send to Finlay** (every week or two, and before any phone
  change): builds a `dmc-export-YYYY-MM-DD.json` and opens the iOS share sheet — **nothing
  leaves the phone until he picks a destination** (AirDrop / Messages / Mail / Save to
  Files). That file is also his only backup, so he should keep a copy; **Restore from
  file** reloads it completely.

## 5. Updating the Excel workbook (Finlay)

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

## 6. Shipping an app update (Finlay)

1. Edit the code in `app/`.
2. Bump the version in **two places**: `VERSION` at the top of `app/sw.js` and
   `APP_VERSION` in `app/js/app.js`.
3. If you added a new JS module, add it to the `ASSETS` list in `app/sw.js` too, or it
   won't be cached and the app breaks offline.
4. Commit and push. Within 40–90 seconds GitHub Pages serves the new version.
5. The update applies **automatically** next time he opens the app (no toast to tap), and
   he sees a short "Updated to vX ✔" confirmation. **His data is untouched by updates** —
   it lives in IndexedDB, which app updates never touch. Verified by
   `tests/v2_data_survival_test.py`.

## Folder layout

```
app/                         the PWA (deploy target)
  index.html, sw.js, manifest, css/app.css, icons/
  js/  app.js db.js models.js billing.js schedule.js insights.js
       alerts.js messages.js export.js demo.js icons.js
  js/views/  dashboard.js (Today) schedule.js jobrow.js clients.js
             crew.js invoices.js (Money incl. Insights) expenses.js settings.js
scripts/import_to_excel.py   JSON export → DMC_Books.xlsx
scripts/serve.py             local dev server, no-cache, port 8765
tests/                       Playwright + data-integrity suites (run before shipping)
```

## Tests (Finlay, before any release)

```
python scripts\serve.py                    # in one window, then:
python tests\v2_test.py                    # 22-step end-to-end (needs Edge)
python tests\v2_offline_test.py            # precache + fully-offline render
python tests\v2_data_survival_test.py      # old data survives an update
```

## Safety notes

* **Never commit** export JSON files or `DMC_Books.xlsx` — `.gitignore` already blocks
  them, keep it that way.
* His iPhone passcode + iOS encryption protect the data at rest; the app adds a
  "back up your data" alert if no export has happened in 30 days.
* Restore replaces everything on the device — it asks for confirmation first.
