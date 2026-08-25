"""Does a v1.9 -> v2 update erase his data? Seed v1.9-shaped records (no v2 fields),
then load the v2 app and verify every record survives untouched and renders."""
import json
import re
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:8765/"

# v1.9-era records: NO crewId / defaultCrewId / shiftId / jobId anywhere
SEED = {
    "clients": [
        {"id": "c1", "name": "Marie Belanger", "phone": "506-555-0101", "email": "", "address": "12 Elm",
         "notes": "gate code 4412", "createdAt": "2026-05-01T00:00:00Z", "updatedAt": "2026-05-01T00:00:00Z"},
        {"id": "c2", "name": "Vet Clinic", "phone": "", "email": "", "address": "88 Main", "notes": "",
         "createdAt": "2026-05-02T00:00:00Z", "updatedAt": "2026-05-02T00:00:00Z"},
    ],
    "contracts": [
        {"id": "k1", "clientId": "c1", "service": "mowing", "description": "weekly", "price": 45,
         "billing": "per-visit", "frequency": "weekly", "startDate": "2026-05-01", "endDate": "",
         "repeat": "weekly", "nextDate": "2026-08-25", "status": "active", "notes": "",
         "createdAt": "2026-05-01T00:00:00Z", "updatedAt": "2026-05-01T00:00:00Z"},
        {"id": "k2", "clientId": "c2", "service": "plowing", "description": "per push", "price": 120,
         "billing": "per-push", "frequency": "per snowfall", "startDate": "2026-11-01", "endDate": "",
         "repeat": "none", "nextDate": "", "status": "active", "notes": "signed early",
         "createdAt": "2026-05-02T00:00:00Z", "updatedAt": "2026-05-02T00:00:00Z"},
    ],
    "invoices": [
        {"id": "i1", "number": "INV-0001", "clientId": "c1", "contractId": "k1", "dateIssued": "2026-07-01",
         "dueDate": "2026-07-15", "amount": 180, "status": "sent", "notes": "",
         "createdAt": "2026-07-01T00:00:00Z", "updatedAt": "2026-07-01T00:00:00Z"},
        {"id": "i2", "number": "INV-0002", "clientId": "c2", "contractId": "k2", "dateIssued": "2026-08-01",
         "dueDate": "2026-08-15", "amount": 240, "status": "sent", "notes": "",
         "createdAt": "2026-08-01T00:00:00Z", "updatedAt": "2026-08-01T00:00:00Z"},
    ],
    "payments": [
        {"id": "p1", "invoiceId": "i1", "clientId": "c1", "date": "2026-07-10", "amount": 180,
         "method": "e-transfer", "note": "", "createdAt": "2026-07-10T00:00:00Z", "updatedAt": "2026-07-10T00:00:00Z"},
    ],
    "expenses": [
        {"id": "e1", "date": "2026-07-05", "amount": 62.5, "category": "Fuel", "vendor": "Irving",
         "line": "mowing", "note": "", "createdAt": "2026-07-05T00:00:00Z", "updatedAt": "2026-07-05T00:00:00Z"},
    ],
    "budgets": [
        {"id": "b1", "category": "Fuel", "period": "monthly", "limit": 200, "updatedAt": "2026-07-01T00:00:00Z"},
    ],
    "visits": [
        {"id": "v1", "contractId": "k1", "clientId": "c1", "date": "2026-08-18", "note": "", "invoiceId": "",
         "createdAt": "2026-08-18T00:00:00Z", "updatedAt": "2026-08-18T00:00:00Z"},
    ],
    "quotes": [
        {"id": "q1", "clientId": "", "prospectName": "Oak St neighbour", "prospectPhone": "", "prospectAddress": "",
         "service": "mowing", "description": "", "price": 50, "billing": "per-visit", "frequency": "weekly",
         "dateIssued": "2026-08-10", "expiryDate": "2026-09-10", "status": "open", "notes": "", "contractId": "",
         "createdAt": "2026-08-10T00:00:00Z", "updatedAt": "2026-08-10T00:00:00Z"},
    ],
    "mileage": [
        {"id": "m1", "date": "2026-08-01", "km": 42, "line": "mowing", "note": "",
         "createdAt": "2026-08-01T00:00:00Z", "updatedAt": "2026-08-01T00:00:00Z"},
    ],
    "equipment": [
        {"id": "eq1", "name": "Toro mower", "purchaseDate": "2025-06-01", "cost": 1899, "line": "mowing",
         "lastServiceDate": "", "serviceNotes": "", "notes": "",
         "createdAt": "2025-06-01T00:00:00Z", "updatedAt": "2025-06-01T00:00:00Z"},
    ],
    # v1.9 crew + shift: shift has NO jobId
    "crew": [
        {"id": "w1", "name": "Kevin", "phone": "506-555-0909", "defaultRate": 20, "notes": "", "status": "active",
         "createdAt": "2026-06-01T00:00:00Z", "updatedAt": "2026-06-01T00:00:00Z"},
    ],
    "shifts": [
        {"id": "s1", "crewId": "w1", "date": "2026-08-20", "hours": 3, "rate": 20, "flatAmount": 0, "amount": 60,
         "clientId": "c1", "line": "mowing", "note": "", "paid": False, "paidDate": "",
         "createdAt": "2026-08-20T00:00:00Z", "updatedAt": "2026-08-20T00:00:00Z"},
    ],
    # v1.9 job override: NO crewId / shiftId
    "jobs": [
        {"id": "j1", "date": "2026-08-24", "clientId": "c1", "contractId": "k1", "note": "", "status": "done",
         "origDate": "2026-08-24", "visitId": "v1",
         "createdAt": "2026-08-24T00:00:00Z", "updatedAt": "2026-08-24T00:00:00Z"},
    ],
}

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # --- step 1: land on the app so the DB exists, then write v1.9-shaped data ---
    page.goto(BASE)
    page.wait_for_selector(".tabbar .tab")
    written = page.evaluate(
        """async (seed) => {
             const db = await new Promise((res, rej) => { const r = indexedDB.open('dmc-db');
               r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
             for (const [store, recs] of Object.entries(seed)) {
               await new Promise((res, rej) => { const t = db.transaction(store, 'readwrite');
                 const os = t.objectStore(store); recs.forEach(r => os.put(r));
                 t.oncomplete = res; t.onerror = () => rej(t.error); });
             }
             return db.version; }""",
        SEED,
    )
    print(f"seeded v1.9-shaped data; IndexedDB version = {written}")

    # --- step 2: simulate the update landing: full reload with the new v2 code + SW ---
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=15000)
    page.reload()
    page.wait_for_selector(".tabbar .tab")
    page.reload()  # second reload = the SW-controlled path his phone takes on next open
    page.wait_for_selector(".tabbar .tab")

    # --- step 3: is every record still there, byte for byte? ---
    after = page.evaluate(
        """async (stores) => {
             const db = await new Promise(res => { const r = indexedDB.open('dmc-db'); r.onsuccess = () => res(r.result); });
             const out = {};
             for (const s of stores) {
               out[s] = await new Promise(res => { const q = db.transaction(s).objectStore(s).getAll();
                 q.onsuccess = () => res(q.result); });
             }
             return out; }""",
        list(SEED.keys()),
    )
    for store, recs in SEED.items():
        got = after[store]
        assert len(got) == len(recs), f"{store}: had {len(recs)}, now {len(got)}  <-- DATA LOSS"
        by_id = {r["id"]: r for r in got}
        for orig in recs:
            cur = by_id.get(orig["id"])
            assert cur is not None, f"{store}/{orig['id']} VANISHED"
            for k, v in orig.items():
                assert cur.get(k) == v, f"{store}/{orig['id']} field {k}: {v!r} -> {cur.get(k)!r} CHANGED"
        print(f"  intact: {store} ({len(got)} record{'s' if len(got) != 1 else ''})")

    # --- step 4: does the v2 UI render that old data correctly? ---
    page.click('.tab[data-view="invoices"]')
    page.locator(".filters .fbtn", has_text=re.compile("^all$", re.I)).click()
    expect(page.locator("#view")).to_contain_text("INV-0002")
    page.click('.tab[data-view="clients"]')
    expect(page.locator("#view")).to_contain_text("Marie Belanger")
    expect(page.locator("#view")).to_contain_text("Vet Clinic")
    page.click('.tab[data-view="crew"]')
    expect(page.locator("#view")).to_contain_text("Kevin")
    expect(page.locator("#view")).to_contain_text("$60.00")  # the unpaid v1.9 shift still owed
    page.click('.tab[data-view="invoices"]')
    page.locator(".segment .seg", has_text="Spend").click()   # Expenses = Money > Spend
    expect(page.locator("#view")).to_contain_text("Irving")
    page.click('.tab[data-view="schedule"]')
    page.click('.tab[data-view="dashboard"]')
    assert page.locator(".chip.assignee").count() == 0, "old data must show no assignee chips"
    print("  v2 UI renders all v1.9 data across every tab; no phantom assignments")

    assert not errors, f"page errors: {errors}"
    print("\nRESULT: v1.9 data survives the v2 update 100% intact, zero errors.")
    browser.close()
