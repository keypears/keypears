import { expect, test, type Page } from "@playwright/test";
import {
  createAccount,
  login,
  logout,
  uniqueAccount,
  type TestAccount,
} from "./helpers/account";

const MESSAGE_TIMEOUT = 30_000;

test.describe.configure({ mode: "serial" });

test("sends, receives, reads, and retains a same-domain text message", async ({
  page,
}) => {
  const alice = uniqueAccount("alice");
  const bob = uniqueAccount("bob");
  const message = `hello bob ${Date.now().toString(36)}`;

  await createAccount(page, alice);
  await logout(page);
  await createAccount(page, bob);
  await logout(page);

  await login(page, alice);
  await sendMessage(page, bob, message);
  await expectChannelMessage(page, bob.address, message);

  await logout(page);
  await login(page, bob);
  await expectUnreadChannel(page, alice.address);
  await openChannel(page, alice.address);
  await expectChannelMessage(page, alice.address, message);
  await expectUnreadCleared(page, alice.address);
});

async function sendMessage(
  page: Page,
  recipient: TestAccount,
  message: string,
) {
  await page.goto("/send");
  await page
    .getByPlaceholder("Recipient address (e.g. alice@keypears.com)")
    .fill(recipient.address);
  await expect(page.getByText("Recipient found")).toBeVisible({
    timeout: MESSAGE_TIMEOUT,
  });
  await page.getByPlaceholder("Your message...").fill(message);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Computing proof of work...")).toBeVisible();
}

async function expectChannelMessage(
  page: Page,
  counterpartyAddress: string,
  message: string,
) {
  await expect(
    page.getByText(counterpartyAddress, { exact: true }).first(),
  ).toBeVisible({
    timeout: MESSAGE_TIMEOUT,
  });
  await expect(page.getByText(message, { exact: true })).toBeVisible({
    timeout: MESSAGE_TIMEOUT,
  });
}

async function expectUnreadChannel(page: Page, counterpartyAddress: string) {
  await page.goto("/inbox");
  const channel = channelLink(page, counterpartyAddress);
  await expect(channel).toBeVisible({ timeout: MESSAGE_TIMEOUT });
  await expect(channel.locator("span").filter({ hasText: /^1$/ })).toBeVisible({
    timeout: MESSAGE_TIMEOUT,
  });
}

async function openChannel(page: Page, counterpartyAddress: string) {
  await channelLink(page, counterpartyAddress).click();
  await expect(
    page.getByText(counterpartyAddress, { exact: true }).first(),
  ).toBeVisible({
    timeout: MESSAGE_TIMEOUT,
  });
}

async function expectUnreadCleared(page: Page, counterpartyAddress: string) {
  await page.goto("/inbox");
  const channel = channelLink(page, counterpartyAddress);
  await expect(channel).toBeVisible({ timeout: MESSAGE_TIMEOUT });
  await expect(channel.locator("span").filter({ hasText: /^1$/ })).toHaveCount(
    0,
    { timeout: MESSAGE_TIMEOUT },
  );
}

function channelLink(page: Page, counterpartyAddress: string) {
  return page
    .getByRole("link")
    .filter({ hasText: counterpartyAddress })
    .first();
}
