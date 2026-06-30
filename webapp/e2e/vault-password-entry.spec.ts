import { expect, test, type Page } from "@playwright/test";
import { createAccount, uniqueAccount } from "./helpers/account";

const VAULT_TIMEOUT = 30_000;

test.describe.configure({ mode: "serial" });

test("creates, searches, edits, and deletes a vault login entry", async ({
  page,
}) => {
  const account = uniqueAccount("vault");
  const suffix = Date.now().toString(36);
  const entry = {
    name: `Vault Login ${suffix}`,
    searchTerms: `work prod ${suffix}`,
    domain: `service-${suffix}.example.com`,
    username: `vault-user-${suffix}`,
    email: `vault-${suffix}@example.com`,
    password: `vault-password-${suffix}!A7`,
    notes: `initial vault notes ${suffix}`,
  };
  const updated = {
    name: `Vault Login Updated ${suffix}`,
    searchTerms: `personal rotated ${suffix}`,
    username: `vault-user-updated-${suffix}`,
    password: `vault-password-updated-${suffix}!B8`,
    notes: `updated vault notes ${suffix}`,
  };

  await createAccount(page, account);
  await createVaultLogin(page, entry);
  await expectVaultLogin(page, entry);

  await searchVault(page, entry.searchTerms, entry.name);
  await openVaultEntry(page, entry.name);

  await editVaultLogin(page, updated);
  await expectVaultLogin(page, { ...entry, ...updated });
  await expect(page.getByText("v2", { exact: false })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await expect(
    page.getByRole("button", { name: "History (1 version)" }),
  ).toBeVisible({ timeout: VAULT_TIMEOUT });

  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByText(updated.password, { exact: true })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });

  await deleteVaultEntry(page);
  await expect(page.getByText("Your vault is empty.")).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });

  await searchVault(page, updated.searchTerms);
  await expect(page.getByText("No matching entries.")).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await expect(page.getByRole("link", { name: updated.name })).toHaveCount(0);
});

async function createVaultLogin(
  page: Page,
  entry: {
    name: string;
    searchTerms: string;
    domain: string;
    username: string;
    email: string;
    password: string;
    notes: string;
  },
) {
  await page.goto("/vault");
  await page.getByRole("button", { name: "New Entry" }).click();
  await page.getByLabel("Name", { exact: true }).fill(entry.name);
  await page.getByLabel("Search terms").fill(entry.searchTerms);
  await page.getByLabel("Domain").fill(entry.domain);
  await page.getByLabel("Username").fill(entry.username);
  await page.getByLabel("Email").fill(entry.email);
  await page.getByLabel("Password").fill(entry.password);
  await page.getByLabel("Notes").fill(entry.notes);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: entry.name })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
}

async function expectVaultLogin(
  page: Page,
  entry: {
    name: string;
    searchTerms: string;
    domain: string;
    username: string;
    email: string;
    password: string;
    notes: string;
  },
) {
  await expect(page.getByRole("heading", { name: entry.name })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await expect(page.getByText(entry.searchTerms, { exact: true })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await expect(page.getByText(entry.domain, { exact: true })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await expect(page.getByText(entry.username, { exact: true })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await expect(page.getByText(entry.email, { exact: true })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await expect(page.getByText(entry.notes, { exact: true })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await expect(page.getByText(entry.password, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByText(entry.password, { exact: true })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
  await page.getByRole("button", { name: "Hide password" }).click();
}

async function searchVault(
  page: Page,
  query: string,
  expectedEntryName?: string,
) {
  await page.goto("/vault");
  await page.getByPlaceholder("Search vault...").fill(query);
  if (expectedEntryName) {
    await expect(vaultEntryLink(page, expectedEntryName)).toBeVisible({
      timeout: VAULT_TIMEOUT,
    });
  }
}

async function openVaultEntry(page: Page, name: string) {
  await vaultEntryLink(page, name).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
}

async function editVaultLogin(
  page: Page,
  updated: {
    name: string;
    searchTerms: string;
    username: string;
    password: string;
    notes: string;
  },
) {
  await page.getByRole("button", { name: "Entry actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Name", { exact: true }).fill(updated.name);
  await page.getByLabel("Search terms").fill(updated.searchTerms);
  await page.getByLabel("Username").fill(updated.username);
  await page.getByLabel("Password").fill(updated.password);
  await page.getByLabel("Notes").fill(updated.notes);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: updated.name })).toBeVisible({
    timeout: VAULT_TIMEOUT,
  });
}

async function deleteVaultEntry(page: Page) {
  await page.getByRole("button", { name: "Entry actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
}

function vaultEntryLink(page: Page, name: string) {
  return page.getByRole("link").filter({ hasText: name }).first();
}
