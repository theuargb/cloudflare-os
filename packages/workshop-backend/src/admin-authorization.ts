/**
 * Applies Workshop deployment admin policy to a trusted authenticated username. `admins` uses the
 * same array-or-JSON-string configuration shape as the server's AuthenticatedApi policy.
 */
export function isDeploymentAdmin(admins: string[] | string | undefined,
                                  username: string | undefined): boolean {
  if (!username || !admins) return false;
  if (typeof admins === "string") admins = JSON.parse(admins);
  if (!Array.isArray(admins)) throw new TypeError("ADMINS must be configured as an array of usernames.");
  return admins.includes(username);
}
