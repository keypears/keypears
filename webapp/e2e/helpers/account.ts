import { expect, type Page } from "@playwright/test";

export interface TestAccount {
  address: string;
  password: string;
}

export interface TestServer {
  origin: string;
  domain: string;
}

export const KEYPEARS_SERVER: TestServer = {
  origin: "https://keypears.test",
  domain: "keypears.test",
};

export const PASSAPPLES_SERVER: TestServer = {
  origin: "https://keypears.passapples.test",
  domain: "passapples.test",
};

export function appUrl(server: TestServer, path: string) {
  return new URL(path, server.origin).toString();
}

export function uniqueAccount(
  prefix: string,
  domain = KEYPEARS_SERVER.domain,
): TestAccount {
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  return {
    address: `${safePrefix}${suffix}@${domain}`,
    password: `Correct Horse Battery Staple ${suffix}!`,
  };
}

export async function expectWebGpuAvailable(
  page: Page,
  server = KEYPEARS_SERVER,
) {
  await page.goto(appUrl(server, "/"));
  const result = await page.evaluate(async () => {
    if (!("gpu" in navigator)) {
      return { ok: false, reason: "navigator.gpu is missing" };
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { ok: false, reason: "navigator.gpu.requestAdapter() failed" };
    }

    return {
      ok: true,
      reason: "",
    };
  });

  expect(result.ok, result.reason).toBe(true);
}

export async function expectRealPowMiningWorks(page: Page) {
  await expectWebGpuAvailable(page);
  await startAccountCreation(page);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(
    page.getByRole("button", { name: "Create an Account" }),
  ).toBeVisible({
    timeout: 30_000,
  });
}

async function startAccountCreation(page: Page, server = KEYPEARS_SERVER) {
  await page.goto(appUrl(server, "/"));
  await page.getByRole("button", { name: "Create an Account" }).click();
  await expect(page.getByText("Computing proof of work...")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose Your Address" }),
    "Real WebGPU PoW did not solve the KeyPears account-creation challenge.",
  ).toBeVisible({
    timeout: 90_000,
  });
}

export async function createAccount(
  page: Page,
  account: TestAccount,
  server = KEYPEARS_SERVER,
) {
  await startAccountCreation(page, server);
  const addressInput = page.getByPlaceholder(`yourname@${server.domain}`);
  await addressInput.fill(account.address);
  await addressInput.blur();
  await expect(page.getByText("This address is available!")).toBeVisible();
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill(account.password);
  await page.getByPlaceholder("Confirm password").fill(account.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expectHome(page, account);
}

export async function logout(page: Page, server = KEYPEARS_SERVER) {
  await page.goto(appUrl(server, "/home"));
  await expect(page.getByRole("button", { name: "User menu" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(
    page.getByRole("button", { name: "Create an Account" }),
  ).toBeVisible({
    timeout: 30_000,
  });
}

export async function login(
  page: Page,
  account: TestAccount,
  server = KEYPEARS_SERVER,
) {
  await page.goto(appUrl(server, "/login"));
  await page
    .getByPlaceholder(`KeyPears address (e.g. name@${server.domain})`)
    .fill(account.address);
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill(account.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByText("Computing proof of work...")).toBeVisible();
  await expectHome(page, account);
}

export async function expectHome(page: Page, account: TestAccount) {
  await expect(
    page.getByRole("main").getByRole("link", { name: account.address }),
  ).toBeVisible({
    timeout: 90_000,
  });
}
