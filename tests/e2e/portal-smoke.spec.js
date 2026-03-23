const { test, expect } = require("@playwright/test");
const fixtureSupport = require("../../test-support/fixtures/index.cjs");

const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Q6zAAAAAASUVORK5CYII=",
  "base64"
);

const portalBootstrap = fixtureSupport.readJsonFixture("portal-bootstrap.json");
const sites = fixtureSupport.readJsonFixture("sites.json");
const parameters = fixtureSupport.readJsonFixture("parameters.json");
const measurements = fixtureSupport.readJsonFixture("measurements.json");
const mapsToken = fixtureSupport.readJsonFixture("maps-token.json");

async function fulfillJson(route, body) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("public portal smoke flow renders bootstrap data and enters the interactive state", async ({
  page,
}) => {
  await page.route("**/api/portal/bootstrap", (route) => fulfillJson(route, portalBootstrap));
  await page.route("**/api/sites", (route) => fulfillJson(route, sites));
  await page.route("**/api/parameters", (route) => fulfillJson(route, parameters));
  await page.route("**/api/measurements", (route) => fulfillJson(route, measurements));
  await page.route("**/api/maps/token", (route) => fulfillJson(route, mapsToken));
  await page.route("https://atlas.microsoft.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: transparentPng,
    });
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /welcome to the nw michigan water quality database/i })
  ).toBeVisible();
  await expect(page.getByText(/john ransom/i)).toBeVisible();
  await expect(page.getByText(/benzie county conservation district/i)).toBeVisible();

  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByRole("button", { name: /update plot 1/i })).toBeVisible();
  await expect(page.locator("select").first()).toHaveValue("2000");
  await expect(page.locator("select").nth(2).locator("option", { hasText: "Chloro" })).toHaveCount(1);

  await page.getByRole("button", { name: /contact/i }).click();

  await expect(page.getByRole("dialog", { name: /contact us/i })).toBeVisible();
  await expect(page.getByText("John Ransom")).toBeVisible();
  await expect(page.getByText("Benzie County Conservation District")).toBeVisible();
  await expect(page.getByText("231-882-4391")).toBeVisible();
  await expect(page.getByText("john@benziecd.org")).toBeVisible();
});
