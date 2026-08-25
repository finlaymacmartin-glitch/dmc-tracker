"""DMC v2.0 prototype test: IA restructure + crew delegation full loop.

Gotchas honored: ephemeral browser.new_context() (fresh-profile persistent
contexts break IndexedDB), case-insensitive text asserts (CSS uppercases),
wait on persistent text not toasts, auto-accept window.confirm.
"""
import re
import sys
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:8765/"
PASS = []


def ok(name):
    PASS.append(name)
    print(f"  pass: {name}")


def run(pw):
    browser = pw.chromium.launch(channel="msedge", headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844})  # iPhone-ish
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    # ---- 1. shell: tabs + gear ----
    tabs = page.locator(".tabbar .tab")
    expect(tabs).to_have_count(6)
    labels = [tabs.nth(i).inner_text().strip().lower() for i in range(6)]
    assert labels == ["today", "schedule", "clients", "crew", "money", "expenses"], labels
    ok("tab bar is Today/Schedule/Clients/Crew/Money/Expenses")
    expect(page.locator("#settings-btn")).to_be_visible()
    page.click("#settings-btn")
    expect(page.locator("#view-title")).to_contain_text("Settings")
    ok("topbar gear reaches Settings")

    # ---- 2. demo data (only offered when empty) ----
    page.get_by_role("button", name=re.compile("load demo data", re.I)).click()
    page.wait_for_selector("text=/Send data to Finlay/i")
    ok("demo data loaded")

    # ---- 3. Today screen ----
    page.click('.tab[data-view="dashboard"]')
    expect(page.locator("#view-title")).to_contain_text("Today")
    body = page.locator("#view")
    expect(body.locator(".section-label").first).to_have_text(re.compile("today", re.I))
    ok("Today section leads the screen")
    expect(body.locator(".hero-card .hero-value")).to_be_visible()
    hero = body.locator(".hero-card .hero-value").inner_text()
    assert "$" in hero, hero
    ok(f"money hero renders ({hero})")
    # assignee chip somewhere on today's jobs (Marie's visit is assigned to Kevin in demo)
    expect(body.locator(".chip.assignee").first).to_be_visible()
    ok("assignee chip visible on Today")

    # ---- 4. Done on Today with delegated job -> shift sheet ----
    marie_card = body.locator(".card", has=page.locator(".chip.assignee")).first
    marie_card.get_by_role("button", name=re.compile(r"done", re.I)).click()
    page.wait_for_selector("text=/'s shift/i")
    sheet = page.locator(".modal")
    expect(sheet.get_by_role("button", name=re.compile("log shift", re.I))).to_be_visible()
    sheet.get_by_role("button", name=re.compile("log shift", re.I)).click()
    page.wait_for_selector(".modal", state="detached")
    ok("Done on delegated job -> shift sheet -> logged")

    # ---- 5. Crew tab: owed grew, Their jobs list ----
    page.click('.tab[data-view="crew"]')
    expect(page.locator("#view-title")).to_contain_text("Crew")
    kevin_row = page.locator(".card.tappable", has_text=re.compile("kevin", re.I)).first
    expect(kevin_row).to_contain_text(re.compile(r"on \d+ jobs? this week", re.I))
    ok("crew list shows job count")
    kevin_row.click()
    expect(page.locator("#view")).to_contain_text(re.compile("their jobs", re.I))
    ok("crew detail has Their jobs section")
    # the shift just logged from Today should exist (Marie's client name on a shift row)
    expect(page.locator("#view")).to_contain_text(re.compile("marie", re.I))
    ok("auto-logged shift visible in crew detail")

    # ---- 6. Schedule: assign + move keeps assignee + revert ----
    page.click('.tab[data-view="schedule"]')
    # one-time job "Trim hedges" was seeded assigned to Kevin (yesterday-ish -> catch up or agenda)
    hedge = page.locator(".card", has_text=re.compile("trim hedges", re.I)).first
    expect(hedge.locator(".chip.assignee")).to_be_visible()
    ok("schedule shows assignee chip on one-time job")
    # Move it and confirm the chip survives
    hedge.get_by_role("button", name=re.compile("^move$", re.I)).click()
    page.locator(".modal input[name=date]").fill("2026-08-27")
    page.locator(".modal").get_by_role("button", name=re.compile("move job", re.I)).click()
    page.wait_for_selector(".modal", state="detached")
    hedge2 = page.locator(".card", has_text=re.compile("trim hedges", re.I)).first
    expect(hedge2.locator(".chip.assignee")).to_be_visible()
    ok("moved job keeps its assignee")
    # Assign flow: reassign to me -> chip disappears
    hedge2.get_by_role("button", name=re.compile("reassign", re.I)).click()
    page.locator(".modal select[name=crewId]").select_option("")
    page.locator(".modal").get_by_role("button", name=re.compile("^assign$", re.I)).click()
    page.wait_for_selector(".modal", state="detached")
    hedge3 = page.locator(".card", has_text=re.compile("trim hedges", re.I)).first
    expect(hedge3.locator(".chip.assignee")).to_have_count(0)
    ok("reassign to me removes the chip")

    # ---- 7. Done -> revert deletes unpaid shift ----
    shifts_before = page.evaluate(
        """() => new Promise(res => { const r = indexedDB.open('dmc-db');
             r.onsuccess = () => { const t = r.result.transaction('shifts').objectStore('shifts').getAll();
               t.onsuccess = () => res(t.result.length); }; })"""
    )
    page.click('.tab[data-view="dashboard"]')
    # the delegated (chip-bearing) job we marked Done in step 4 — its button is the revert
    done_row = page.locator("#view .card", has=page.locator(".chip.assignee")).first
    done_row.get_by_role("button", name=re.compile("✓ done", re.I)).click()
    page.wait_for_timeout(600)
    shifts_after = page.evaluate(
        """() => new Promise(res => { const r = indexedDB.open('dmc-db');
             r.onsuccess = () => { const t = r.result.transaction('shifts').objectStore('shifts').getAll();
               t.onsuccess = () => res(t.result.length); }; })"""
    )
    assert shifts_after == shifts_before - 1, (shifts_before, shifts_after)
    ok("revert Done deletes the unpaid auto-logged shift")

    # ---- 8. Money: Insights segment inline ----
    page.click('.tab[data-view="invoices"]')
    segs = page.locator(".segment .seg")
    expect(segs).to_have_count(3)
    segs.nth(2).click()
    expect(page.locator("#view")).to_contain_text(re.compile("monthly cash flow", re.I))
    expect(page.locator("#view")).to_contain_text(re.compile("hiring power", re.I))
    ok("Insights render inline under Money")
    page.locator("#view input[name=hours]").fill("20")
    page.wait_for_timeout(200)
    expect(page.locator("#view")).to_contain_text(re.compile("helper cost", re.I))
    ok("hiring calculator recomputes live")
    # deep link from Today card
    page.click('.tab[data-view="dashboard"]')
    page.locator(".card.tappable", has_text=re.compile("insights", re.I)).first.click()
    expect(page.locator("#view")).to_contain_text(re.compile("monthly cash flow", re.I))
    ok("Today insights card deep-links to Money > Insights")
    # segment tap escapes the deep link (params.mode must not stick)
    page.locator(".segment .seg").nth(0).click()
    expect(page.locator("#view")).to_contain_text(re.compile("new invoice", re.I))
    ok("segment tap escapes the insights deep link")

    # ---- 9. contract form has Usually done by; clients tab has no crew toggle ----
    page.click('.tab[data-view="clients"]')
    assert page.locator(".segment").count() == 0
    ok("Clients tab has no Clients|Crew toggle")
    page.locator(".card.tappable", has_text=re.compile("retirement|marie|bob", re.I)).first.click()
    page.locator(".card.tappable", has_text=re.compile("mowing|plowing", re.I)).first.click()
    expect(page.locator(".modal")).to_contain_text(re.compile("usually done by", re.I))
    page.locator(".modal").get_by_role("button", name=re.compile("cancel", re.I)).click()
    ok("contract form has Usually done by")

    # ---- 10. wages alert deep-links to crew detail ----
    page.click('.tab[data-view="dashboard"]')
    owe_alert = page.locator(".alert", has_text=re.compile("you owe", re.I)).first
    if owe_alert.count():
        owe_alert.click()
        expect(page.locator("#view")).to_contain_text(re.compile("pay out|their jobs", re.I))
        ok("wages alert lands on crew detail")

    # ---- 11. delete crew member clears assignments ----
    page.click('.tab[data-view="crew"]')
    page.locator(".card.tappable", has_text=re.compile("kevin", re.I)).first.click()
    page.locator("#view").get_by_role("button", name=re.compile("^delete$", re.I)).click()
    page.wait_for_selector("text=/add crew member/i")
    chips = page.evaluate(
        """() => new Promise(res => { const r = indexedDB.open('dmc-db');
             r.onsuccess = () => { const db = r.result;
               const jt = db.transaction(['jobs','contracts']);
               const a = jt.objectStore('jobs').getAll(); const b = jt.objectStore('contracts').getAll();
               let out = {};
               a.onsuccess = () => { out.jobs = a.result.filter(j => j.crewId && j.crewId !== 'me').length;
                 b.onsuccess = () => { out.contracts = b.result.filter(k => k.defaultCrewId).length; res(out); }; }; }; })"""
    )
    assert chips["jobs"] == 0 and chips["contracts"] == 0, chips
    page.click('.tab[data-view="dashboard"]')
    assert page.locator(".chip.assignee").count() == 0
    ok("deleting crew member clears job + contract assignments, no ghost chips")

    assert not errors, f"page errors: {errors}"
    ok("no console page errors")

    browser.close()


with sync_playwright() as pw:
    run(pw)
print(f"\nALL {len(PASS)} v2.0 CHECKS PASS")
