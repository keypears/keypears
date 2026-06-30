import { expect, test, type Page } from "@playwright/test";
import {
  createAccount,
  login,
  logout,
  uniqueAccount,
  type TestAccount,
} from "./helpers/account";

const SECURITY_TIMEOUT = 30_000;

test.describe.configure({ mode: "serial" });

test("rotates keys, persists PoW settings, and changes password", async ({
  page,
}) => {
  const account = uniqueAccount("security");
  const oldPassword = account.password;
  const newPassword = `${oldPassword} Updated`;

  await createAccount(page, account);

  await expectInitialKeyState(page);
  await rotateKey(page);
  await expectRotatedKeyState(page);

  await updatePowSettings(page);
  await expectPowSettingsPersist(page);

  await expectPasswordMismatchValidation(page, oldPassword);
  await changePassword(page, oldPassword, newPassword);

  await logout(page);
  await expectOldPasswordRejected(page, account, oldPassword);
  await login(page, { ...account, password: newPassword });
  await expectRotatedKeyState(page);
});

async function expectInitialKeyState(page: Page) {
  await page.goto("/keys");
  const key1 = keyRow(page, 1);
  await expect(key1).toBeVisible({ timeout: SECURITY_TIMEOUT });
  await expect(key1.getByText("Current", { exact: true })).toBeVisible();
  await expect(key1.getByText("Active", { exact: true })).toBeVisible();
  await expect(key1.getByText("Locked", { exact: true })).toHaveCount(0);
}

async function rotateKey(page: Page) {
  await page.goto("/keys");
  await page.getByRole("button", { name: "Rotate Key" }).click();
  await expect(keyRow(page, 2)).toBeVisible({ timeout: SECURITY_TIMEOUT });
}

async function expectRotatedKeyState(page: Page) {
  await page.goto("/keys");
  const key1 = keyRow(page, 1);
  const key2 = keyRow(page, 2);

  await expect(key1).toBeVisible({ timeout: SECURITY_TIMEOUT });
  await expect(key2).toBeVisible({ timeout: SECURITY_TIMEOUT });
  await expect(key1.getByText("Current", { exact: true })).toHaveCount(0);
  await expect(key1.getByText("Active", { exact: true })).toBeVisible();
  await expect(key1.getByText("Locked", { exact: true })).toHaveCount(0);
  await expect(key2.getByText("Current", { exact: true })).toBeVisible();
  await expect(key2.getByText("Active", { exact: true })).toBeVisible();
  await expect(key2.getByText("Locked", { exact: true })).toHaveCount(0);
}

async function updatePowSettings(page: Page) {
  await page.goto("/settings");

  const channelSlider = page.getByLabel("New conversation difficulty");
  await channelSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("700M High — ~2 minutes")).toBeVisible({
    timeout: SECURITY_TIMEOUT,
  });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({
    timeout: SECURITY_TIMEOUT,
  });

  const messageSlider = page.getByLabel("Message difficulty");
  await messageSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("70M Medium — ~15 seconds")).toBeVisible({
    timeout: SECURITY_TIMEOUT,
  });
}

async function expectPowSettingsPersist(page: Page) {
  await page.goto("/home");
  await page.goto("/settings");
  await expect(page.getByText("700M High — ~2 minutes")).toBeVisible({
    timeout: SECURITY_TIMEOUT,
  });
  await expect(page.getByText("70M Medium — ~15 seconds")).toBeVisible({
    timeout: SECURITY_TIMEOUT,
  });
}

async function expectPasswordMismatchValidation(
  page: Page,
  oldPassword: string,
) {
  await page.goto("/password");
  await page.getByLabel("Current password").fill(oldPassword);
  await page
    .getByLabel("New password", { exact: true })
    .fill(`${oldPassword} mismatch`);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(`${oldPassword} other`);
  await expect(page.getByText("Passwords do not match")).toBeVisible();
}

async function changePassword(
  page: Page,
  oldPassword: string,
  newPassword: string,
) {
  await page.goto("/password");
  await page.getByLabel("Current password").fill(oldPassword);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(newPassword);
  await expect(page.getByText("Passwords match")).toBeVisible();
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("main").getByText(/@keypears\.test/)).toBeVisible(
    {
      timeout: SECURITY_TIMEOUT,
    },
  );
}

async function expectOldPasswordRejected(
  page: Page,
  account: TestAccount,
  oldPassword: string,
) {
  await page.goto("/login");
  await page
    .getByPlaceholder("KeyPears address (e.g. name@keypears.test)")
    .fill(account.address);
  await page.getByPlaceholder("Password", { exact: true }).fill(oldPassword);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByText("Computing proof of work...")).toBeVisible();
  await expect(
    page.getByText("Invalid KeyPears address or password."),
  ).toBeVisible({
    timeout: SECURITY_TIMEOUT,
  });
  await expect(
    page.getByRole("main").getByRole("link", { name: account.address }),
  ).toHaveCount(0);
}

function keyRow(page: Page, keyNumber: number) {
  return page.getByRole("group", { name: `Key #${keyNumber}` });
}
