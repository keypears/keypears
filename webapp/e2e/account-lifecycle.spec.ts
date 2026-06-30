import { test } from "@playwright/test";
import {
  createAccount,
  expectWebGpuAvailable,
  expectRealPowMiningWorks,
  login,
  logout,
  uniqueAccount,
} from "./helpers/account";

test.describe.configure({ mode: "serial" });

test("browser exposes WebGPU for real proof-of-work mining", async ({
  page,
}) => {
  await expectRealPowMiningWorks(page);
});

test("creates an account, logs out, and logs back in", async ({ page }) => {
  const account = uniqueAccount("e2e-account");

  await expectWebGpuAvailable(page);
  await createAccount(page, account);
  await logout(page);
  await login(page, account);
});
