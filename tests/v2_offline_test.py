"""Offline check: SW precache must cover every module (esp. new crew.js/jobrow.js)."""
import re
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:8765/"

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge", headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    # wait until the SW controls the page and the precache is fully populated
    page.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=15000)
    cached = page.evaluate(
        """async () => { const keys = await caches.keys();
             const c = await caches.open(keys.find(k => k.startsWith('dmc-')));
             return (await c.keys()).map(r => new URL(r.url).pathname); }"""
    )
    for mod in ["js/views/crew.js", "js/views/jobrow.js", "js/views/dashboard.js"]:
        assert any(p.endswith(mod) for p in cached), f"{mod} NOT precached! cached={cached}"
    print(f"pass: precache holds {len(cached)} assets incl. crew.js + jobrow.js")

    ctx.set_offline(True)
    page.reload()
    page.wait_for_selector(".tabbar .tab", timeout=15000)
    for view, marker in [("dashboard", "Today"), ("schedule", "Schedule"), ("clients", "Clients"),
                         ("crew", "Crew"), ("invoices", "Money"), ("expenses", "Expenses")]:
        page.click(f'.tab[data-view="{view}"]')
        expect(page.locator("#view-title")).to_contain_text(marker)
    page.click("#settings-btn")
    expect(page.locator("#view-title")).to_contain_text("Settings")
    assert not errors, f"page errors offline: {errors}"
    print("pass: all 6 tabs + settings render fully OFFLINE, zero page errors")
    browser.close()

print("OFFLINE TEST PASS")
