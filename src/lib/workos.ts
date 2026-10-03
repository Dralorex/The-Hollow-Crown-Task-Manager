import "server-only";
import { WorkOS } from "@workos-inc/node";

let workosSingleton: WorkOS | null | undefined;

/** SSO is scaffold-only until Enterprise; default OFF. */
export function isSsoEnabled(): boolean {
  return process.env.ENABLE_SSO?.trim().toLowerCase() === "true";
}

export function isWorkosConfigured(): boolean {
  return Boolean(
    process.env.WORKOS_API_KEY?.trim() && process.env.WORKOS_CLIENT_ID?.trim(),
  );
}

export function getWorkOS(): WorkOS | null {
  if (workosSingleton !== undefined) return workosSingleton;
  const apiKey = process.env.WORKOS_API_KEY?.trim();
  if (!apiKey) {
    workosSingleton = null;
    return null;
  }
  workosSingleton = new WorkOS(apiKey);
  return workosSingleton;
}

export function getWorkosClientId(): string | null {
  return process.env.WORKOS_CLIENT_ID?.trim() || null;
}

export function getWorkosRedirectUri(): string | null {
  return process.env.WORKOS_REDIRECT_URI?.trim() || null;
}

/**
 * Build a WorkOS SSO authorization URL.
 * Requires ENABLE_SSO=true and configured WorkOS env.
 * Pass `organization` (WorkOS org id) or `connection`, or a temporary
 * `provider` for scaffold URL generation in development.
 */
export function getSsoAuthorizationUrl(opts: {
  organization?: string;
  connection?: string;
  provider?: string;
  domainHint?: string;
  state?: string;
}): string {
  if (!isSsoEnabled()) {
    throw new Error("SSO is disabled (ENABLE_SSO is not true).");
  }
  const workos = getWorkOS();
  const clientId = getWorkosClientId();
  const redirectUri = getWorkosRedirectUri();
  if (!workos || !clientId || !redirectUri) {
    throw new Error("WorkOS is not fully configured.");
  }
  const base = {
    clientId,
    redirectUri,
    domainHint: opts.domainHint,
    state: opts.state,
  };

  if (opts.organization) {
    return workos.sso.getAuthorizationUrl({
      ...base,
      organization: opts.organization,
    });
  }
  if (opts.connection) {
    return workos.sso.getAuthorizationUrl({
      ...base,
      connection: opts.connection,
    });
  }
  if (opts.provider) {
    return workos.sso.getAuthorizationUrl({
      ...base,
      provider: opts.provider,
    });
  }
  throw new Error(
    "Pass organization, connection, or provider (scaffold) as a query param.",
  );
}
