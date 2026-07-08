from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('http://127.0.0.1:3002') # port is 3002
    time.sleep(2)

    # We want to open the panel sections
    page.evaluate('''
        const panel = document.querySelector('[data-slot="panel-body"]');
        if (panel) {
            panel.scrollTop = panel.scrollHeight;
        }
    ''')
    time.sleep(1)

    analyze_btn = page.locator('button:has-text("Analyze Story")')
    if analyze_btn.count() > 0:
        analyze_btn.first.click(force=True)
        time.sleep(1)

    page.screenshot(path="/app/verification-click3.png")
