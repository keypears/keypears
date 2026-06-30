import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  appUrl,
  createAccount,
  login,
  logout,
  KEYPEARS_SERVER,
  PASSAPPLES_SERVER,
  uniqueAccount,
  type TestAccount,
  type TestServer,
} from "./helpers/account";

const FEDERATION_TIMEOUT = 30_000;

test.describe.configure({ mode: "serial" });

test("local well-known files advertise the expected KeyPears API domains", async ({
  request,
}) => {
  await expectWellKnown(request, "https://passapples.test", {
    apiDomain: "keypears.passapples.test",
  });
  await expectWellKnown(request, "https://lockberries.test", {
    apiDomain: "keypears.test",
    admin: "lockberries@keypears.test",
  });
});

test("sends and receives messages across keypears and passapples domains", async ({
  page,
}) => {
  const alice = uniqueAccount("fedalice", KEYPEARS_SERVER.domain);
  const bob = uniqueAccount("fedbob", PASSAPPLES_SERVER.domain);
  const aliceToBob = `hello passapples ${Date.now().toString(36)}`;
  const bobToAlice = `hello keypears ${Date.now().toString(36)}`;

  await createAccount(page, alice, KEYPEARS_SERVER);
  await logout(page, KEYPEARS_SERVER);
  await createAccount(page, bob, PASSAPPLES_SERVER);
  await logout(page, PASSAPPLES_SERVER);

  await login(page, alice, KEYPEARS_SERVER);
  await sendMessage(page, KEYPEARS_SERVER, bob, aliceToBob);
  await expectChannelMessage(page, bob.address, aliceToBob);

  await logout(page, KEYPEARS_SERVER);
  await login(page, bob, PASSAPPLES_SERVER);
  await expectUnreadChannel(page, PASSAPPLES_SERVER, alice.address);
  await openChannel(page, alice.address);
  await expectChannelMessage(page, alice.address, aliceToBob);
  await expectUnreadCleared(page, PASSAPPLES_SERVER, alice.address);

  await sendMessage(page, PASSAPPLES_SERVER, alice, bobToAlice);
  await expectChannelMessage(page, alice.address, bobToAlice);

  await logout(page, PASSAPPLES_SERVER);
  await login(page, alice, KEYPEARS_SERVER);
  await expectUnreadChannel(page, KEYPEARS_SERVER, bob.address);
  await openChannel(page, bob.address);
  await expectChannelMessage(page, bob.address, bobToAlice);
  await expectUnreadCleared(page, KEYPEARS_SERVER, bob.address);
});

async function expectWellKnown(
  request: APIRequestContext,
  origin: string,
  expected: Record<string, string>,
) {
  const response = await request.get(
    new URL("/.well-known/keypears.json", origin).toString(),
  );
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toMatchObject(expected);
}

async function sendMessage(
  page: Page,
  server: TestServer,
  recipient: TestAccount,
  message: string,
) {
  await page.goto(appUrl(server, "/send"));
  await page
    .getByPlaceholder("Recipient address (e.g. alice@keypears.com)")
    .fill(recipient.address);
  await expect(page.getByText("Recipient found")).toBeVisible({
    timeout: FEDERATION_TIMEOUT,
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
    timeout: FEDERATION_TIMEOUT,
  });
  await expect(page.getByText(message, { exact: true })).toBeVisible({
    timeout: FEDERATION_TIMEOUT,
  });
}

async function expectUnreadChannel(
  page: Page,
  server: TestServer,
  counterpartyAddress: string,
) {
  await page.goto(appUrl(server, "/inbox"));
  const channel = channelLink(page, counterpartyAddress);
  await expect(channel).toBeVisible({ timeout: FEDERATION_TIMEOUT });
  await expect(channel.locator("span").filter({ hasText: /^1$/ })).toBeVisible({
    timeout: FEDERATION_TIMEOUT,
  });
}

async function openChannel(page: Page, counterpartyAddress: string) {
  await channelLink(page, counterpartyAddress).click();
  await expect(
    page.getByText(counterpartyAddress, { exact: true }).first(),
  ).toBeVisible({
    timeout: FEDERATION_TIMEOUT,
  });
}

async function expectUnreadCleared(
  page: Page,
  server: TestServer,
  counterpartyAddress: string,
) {
  await page.goto(appUrl(server, "/inbox"));
  const channel = channelLink(page, counterpartyAddress);
  await expect(channel).toBeVisible({ timeout: FEDERATION_TIMEOUT });
  await expect(channel.locator("span").filter({ hasText: /^1$/ })).toHaveCount(
    0,
    { timeout: FEDERATION_TIMEOUT },
  );
}

function channelLink(page: Page, counterpartyAddress: string) {
  return page
    .getByRole("link")
    .filter({ hasText: counterpartyAddress })
    .first();
}
