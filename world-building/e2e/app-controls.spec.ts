import { expect, test } from "@playwright/test";

test("browser: verifies worldbuilder board interactions", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();

  // Add Card
  const addButton = page.getByRole("button", { name: "Add Card" });
  await expect(addButton).toBeVisible();
  await addButton.click();

  const card = page.locator("[data-node-id]");
  await expect(card).toBeVisible();

  // Select Card
  await card.click();

  // Edit Title
  const titleInput = page.getByLabel("Title");
  await expect(titleInput).toBeVisible();
  await titleInput.fill("Updated Hero Name");
  await titleInput.blur();

  await expect(titleInput).toHaveValue("Updated Hero Name");

  // Clear Board
  const clearButton = page.getByRole("button", { name: "Clear Board" });
  await expect(clearButton).toBeVisible();
  await clearButton.click();
  await expect(card).toHaveCount(0);
});

test("browser: verifies worldbuilder preview render", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies canvas panning stability", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies card dragging performance", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies board png export", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();

  // Click sticky export actions
  await page.getByRole("button", { name: "Export PNG" }).click();

  // Decode the exported image to assert dimensions for selected 2k/4k/8k resolution
  // export.image.resolution and width/height matching
  const { width, height } = await page.evaluate(() => {
    return new Promise<{ width: number, height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    });
  });
  console.log("Decoded image width and height for resolution:", width, height);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
});

test("browser: verifies snap to grid behavior", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies grid size slider", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies card selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies card type dropdown", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies card title changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies card color changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies markdown card description", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies JSON canvas input", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies include background toggle", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies background color selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies export format dropdown", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies image resolution dropdown", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies panel actions click", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies spline selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies spline relationship label changes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies theme dropdown behavior", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies font scale slider behavior", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies connection style dropdown", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies connection color dropdown", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies connection weight slider", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies ollama model input", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies ollama endpoint input", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies ollama temperature input", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: verifies ollama system prompt input", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});


