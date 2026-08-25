"""Opens every modal/sheet in the app and fails on ANY page error.

Catches the class of bug that static syntax checks miss: a helper used only
inside a modal builder whose import got dropped (e.g. `today` in statementModal,
lost during the v2 crew extraction — the statement silently refused to open).
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8765/"
opened, errors = [], []


def say(m):
    sys.stdout.write(m.encode("ascii", "backslashreplace").decode() + "\n")


def try_open(page, label, act):
    """Run act(), assert a modal appeared, record errors, then close it."""
    before = len(errors)
    try:
        act()
        page.wait_for_timeout(320)
    except Exception as exc:
        errors.append(f"{label}: click failed — {exc}")
        return
    if page.locator(".modal").count() == 0:
        errors.append(f"{label}: NO MODAL OPENED")
    elif len(errors) == before:
        opened.append(label)
        say(f"  ok: {label}")
    # close: Cancel/Close button if present, else click the backdrop
    m = page.locator(".modal")
    if m.count():
        btn = m.get_by_role("button", name=re.compile(r"^(cancel|close)$", re.I))
        if btn.count():
            btn.first.click()
        else:
            page.evaluate("() => document.getElementById('modal-root').innerHTML = ''")
        page.wait_for_timeout(160)


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 900})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"PAGE ERROR: {e}"))
    page.on("console", lambda m: errors.append(f"CONSOLE ERROR: {m.text}") if m.type == "error" else None)
    page.on("dialog", lambda d: d.accept())
    page.goto(BASE)
    page.wait_for_selector(".tabbar .tab")

    # demo data gives us overdue invoices, quotes, crew, budgets to open things against
    page.click("#settings-btn")
    seed = page.get_by_role("button", name=re.compile("load demo data", re.I))
    if seed.count():
        seed.click()
        page.wait_for_selector("text=/Send data to Finlay/i")

    # ---------- Clients ----------
    page.click('.tab[data-view="clients"]')
    try_open(page, "Clients: New client", lambda: page.get_by_role("button", name=re.compile("add client", re.I)).click())
    page.locator("#view .card.tappable").first.click()
    page.wait_for_timeout(250)
    try_open(page, "Client: Statement", lambda: page.get_by_role("button", name=re.compile("statement", re.I)).click())
    try_open(page, "Client: Edit", lambda: page.get_by_role("button", name=re.compile("^edit$", re.I)).first.click())
    try_open(page, "Client: Add contract", lambda: page.get_by_role("button", name=re.compile("add contract", re.I)).click())
    try_open(page, "Client: Edit contract", lambda: page.locator("#view .card.tappable", has_text=re.compile("mowing|plowing", re.I)).first.click())
    vis = page.get_by_role("button", name=re.compile(r"^visits", re.I))
    if vis.count():
        try_open(page, "Client: Visits log", lambda: vis.first.click())

    # ---------- Crew ----------
    page.click('.tab[data-view="crew"]')
    try_open(page, "Crew: New member", lambda: page.get_by_role("button", name=re.compile("add crew member", re.I)).click())
    page.locator("#view .card.tappable").first.click()
    page.wait_for_timeout(250)
    try_open(page, "Crew: Log shift", lambda: page.get_by_role("button", name=re.compile("log shift", re.I)).click())
    try_open(page, "Crew: Edit", lambda: page.get_by_role("button", name=re.compile("^edit$", re.I)).first.click())
    payout = page.get_by_role("button", name=re.compile("pay out", re.I))
    if payout.count():
        try_open(page, "Crew: Pay out", lambda: payout.first.click())

    # ---------- Schedule ----------
    page.click('.tab[data-view="schedule"]')
    try_open(page, "Schedule: One-time job", lambda: page.get_by_role("button", name=re.compile("add one-time job", re.I)).click())
    try_open(page, "Schedule: Move job", lambda: page.get_by_role("button", name=re.compile("^move$", re.I)).first.click())
    asn = page.get_by_role("button", name=re.compile("^(assign|reassign)$", re.I))
    if asn.count():
        try_open(page, "Schedule: Assign job", lambda: asn.first.click())

    # ---------- Money: bills ----------
    page.click('.tab[data-view="invoices"]')
    try_open(page, "Money: New invoice", lambda: page.get_by_role("button", name=re.compile("new invoice", re.I)).click())
    page.locator(".filters .fbtn", has_text=re.compile("^overdue$", re.I)).click()
    page.wait_for_timeout(250)
    if page.locator("#view .card.tappable").count():
        page.locator("#view .card.tappable").first.click()
        page.wait_for_timeout(250)
        try_open(page, "Invoice: Record payment", lambda: page.get_by_role("button", name=re.compile("record payment", re.I)).click())
        try_open(page, "Invoice: Late fee", lambda: page.get_by_role("button", name=re.compile("late fee", re.I)).click())
        try_open(page, "Invoice: Edit", lambda: page.get_by_role("button", name=re.compile("^edit$", re.I)).first.click())

    # ---------- Money: quotes ----------
    page.click('.tab[data-view="invoices"]')
    page.locator(".segment .seg", has_text="Quotes").click()
    page.wait_for_timeout(250)
    try_open(page, "Quotes: New quote", lambda: page.get_by_role("button", name=re.compile("new quote", re.I)).click())
    if page.locator("#view .card.tappable").count():
        try_open(page, "Quotes: Quote actions", lambda: page.locator("#view .card.tappable").first.click())

    # ---------- Money: spend ----------
    page.locator(".segment .seg", has_text="Spend").click()
    page.wait_for_timeout(250)
    try_open(page, "Spend: New expense", lambda: page.get_by_role("button", name=re.compile("add expense", re.I)).click())
    try_open(page, "Spend: Set a budget", lambda: page.get_by_role("button", name=re.compile("set a budget", re.I)).click())
    try_open(page, "Spend: Add trip", lambda: page.get_by_role("button", name=re.compile("add trip", re.I)).click())
    try_open(page, "Spend: Mileage log", lambda: page.get_by_role("button", name=re.compile("view log", re.I)).click())
    try_open(page, "Spend: Add equipment", lambda: page.get_by_role("button", name=re.compile("add equipment", re.I)).click())
    try_open(page, "Spend: Equipment list", lambda: page.get_by_role("button", name=re.compile("view all", re.I)).click())

    # ---------- Money: insights (inline, not a modal) ----------
    page.locator(".segment .seg", has_text="Insights").click()
    page.wait_for_timeout(400)
    if "cash flow" not in page.locator("#view").inner_text().lower():
        errors.append("Insights: did not render")
    else:
        opened.append("Money: Insights (inline)")
        say("  ok: Money: Insights (inline)")

    b.close()

say(f"\n{len(opened)} surfaces opened cleanly")
if errors:
    say("FAILURES:")
    for e in errors:
        say("  - " + e)
    sys.exit(1)
say("ALL MODAL SURFACES OPEN WITHOUT ERRORS")
