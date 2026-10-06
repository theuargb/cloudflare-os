/**
 * The Workshop's deployment admin policy: whether a trusted authenticated username is listed in
 * `ADMINS`. `admins` should be a JSON binding of array type, but `.env` can't express JSON bindings,
 * so a string that parses as a JSON array is accepted too.
 */
export function isDeploymentAdmin(admins: string[] | string | undefined,
                                  username: string | undefined): boolean {
  if (!username || !admins) return false;
  if (typeof admins === "string") admins = JSON.parse(admins);
  if (!Array.isArray(admins)) throw new TypeError("ADMINS must be configured as an array of usernames.");
  return admins.includes(username);
}
