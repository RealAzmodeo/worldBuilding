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

    analyze_btn = page.locator('button', has_text="Analyze Story")
    print(f"Found {analyze_btn.count()} 'Analyze Story' buttons")

    if analyze_btn.count() > 0:
        # the button in the screenshot is actually visible! So we can click it
        analyze_btn.first.click()
        time.sleep(1)

    page.screenshot(path="/app/verification-click2.png")
