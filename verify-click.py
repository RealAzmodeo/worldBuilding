from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('http://127.0.0.1:3002') # port is 3002
    time.sleep(2)

    analyze_btn = page.locator('button', has_text="Analyze Story")
    print(f"Found {analyze_btn.count()} 'Analyze Story' buttons")

    if analyze_btn.count() > 0:
        analyze_btn.first.click()
        time.sleep(1)

    page.screenshot(path="/app/verification-click.png")
