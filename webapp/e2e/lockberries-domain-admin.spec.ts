import { expect, test, type Page } from "@playwright/test";
import {
  appUrl,
  createAccount,
  KEYPEARS_SERVER,
  login,
  logout,
  uniqueAccount,
  type TestAccount,
} from "./helpers/account";

const DOMAIN_ADMIN_TIMEOUT = 30_000;

test.describe.configure({ mode: "serial" });

test("claims lockberries and creates a hosted domain user", async ({
  page,
}) => {
  const admin: TestAccount = {
    address: "lockberries@keypears.test",
    password: `Correct Horse Battery Staple lockberries ${Date.now().toString(
      36,
    )}!`,
  };
  const hostedUser = uniqueAccount("berryuser", "lockberries.test");

  await createAccount(page, admin, KEYPEARS_SERVER);
  await claimLockberriesDomain(page);
  await createHostedUser(page, hostedUser);

  await logout(page, KEYPEARS_SERVER);
  await login(page, hostedUser, KEYPEARS_SERVER);
});

async function claimLockberriesDomain(page: Page) {
  await page.goto(appUrl(KEYPEARS_SERVER, "/domains"));

  await expect(page.getByLabel("API domain")).toHaveValue("keypears.test", {
    timeout: DOMAIN_ADMIN_TIMEOUT,
  });
  await expect(page.getByLabel("Admin")).toHaveValue(
    "lockberries@keypears.test",
  );

  await page.getByPlaceholder("e.g. lockberries.test").fill("lockberries.test");
  await page.getByRole("button", { name: "Claim" }).click();

  await expect(
    page.getByRole("button", { name: /lockberries\.test/ }),
  ).toBeVisible({
    timeout: DOMAIN_ADMIN_TIMEOUT,
  });
}

async function createHostedUser(page: Page, hostedUser: TestAccount) {
  await page.getByRole("button", { name: /lockberries\.test/ }).click();
  await page.getByRole("button", { name: "Add user" }).click();

  await page
    .getByPlaceholder("alice@lockberries.test")
    .fill(hostedUser.address);
  await page.getByPlaceholder("alice@lockberries.test").blur();
  await expect(page.getByText("This address is available!")).toBeVisible({
    timeout: DOMAIN_ADMIN_TIMEOUT,
  });

  await page
    .getByPlaceholder("Password", { exact: true })
    .fill(hostedUser.password);
  await page.getByPlaceholder("Confirm password").fill(hostedUser.password);
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText(hostedUser.address, { exact: true })).toBeVisible(
    {
      timeout: DOMAIN_ADMIN_TIMEOUT,
    },
  );
}
