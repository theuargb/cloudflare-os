import { expect, it } from "vitest";
import { isDeploymentAdmin } from "../src/admin-authorization.js";

it("follows the live deployment ADMINS list independently of workspace ownership", () => {
  let admins: string[] | string | undefined = ["platform-admin"];

  expect(isDeploymentAdmin(admins, "workspace-owner")).toBe(false);
  expect(isDeploymentAdmin(admins, "platform-admin")).toBe(true);

  // Applying a queued action re-evaluates this predicate, so removing the username revokes its
  // admin authority even though the user's workspace membership is still valid.
  admins = ["another-admin"];
  expect(isDeploymentAdmin(admins, "platform-admin")).toBe(false);
});
