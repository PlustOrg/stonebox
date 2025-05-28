// Utility for environment variable allowlisting/merging

const ENV_ALLOWLIST = ['PATH', 'LANG', 'TMPDIR', 'HOME', 'USER'];

/**
 * Returns a sanitized environment object for child processes.
 * Only allowlisted variables and user-provided overrides are included.
 * @param userEnv User-provided env overrides
 * @param allowlist Additional allowlist entries (optional)
 */
export function buildSandboxEnv(
  userEnv: Record<string, string | undefined> = {},
  allowlist: string[] = ENV_ALLOWLIST,
): Record<string, string | undefined> {
  const baseEnv: Record<string, string | undefined> = {};
  for (const key of allowlist) {
    if (process.env[key] !== undefined) {
      baseEnv[key] = process.env[key];
    }
  }
  // User-provided env overrides take precedence
  for (const [k, v] of Object.entries(userEnv)) {
    baseEnv[k] = v;
  }
  return baseEnv;
}

export { ENV_ALLOWLIST };
