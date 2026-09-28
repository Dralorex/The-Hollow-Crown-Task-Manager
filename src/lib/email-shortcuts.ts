/** Common mailbox providers (without TLD — pair with EMAIL_TLDS). */
export const EMAIL_PROVIDERS = [
  { label: "@gmail", domain: "gmail" },
  { label: "@yahoo", domain: "yahoo" },
  { label: "@icloud", domain: "icloud" },
  { label: "@outlook", domain: "outlook" },
  { label: "@hotmail", domain: "hotmail" },
  { label: "@proton", domain: "proton" },
  { label: "@aol", domain: "aol" },
  { label: "@me", domain: "me" },
] as const;

export const EMAIL_TLDS = [
  ".com",
  ".org",
  ".net",
  ".edu",
  ".co",
  ".io",
] as const;

const TLD_RE = /\.(com|org|net|edu|co|io|mail)$/i;

/** Insert/replace the domain provider, keeping any existing TLD when swapping. */
export function applyEmailProvider(value: string, domain: string): string {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  const local = at >= 0 ? trimmed.slice(0, at) : trimmed;
  let tld = "";
  if (at >= 0) {
    const rest = trimmed.slice(at + 1);
    const m = rest.match(TLD_RE);
    if (m) tld = m[0].toLowerCase();
  }
  return `${local}@${domain.toLowerCase()}${tld}`;
}

/** Attach or replace a TLD after @provider (no-op until a domain exists). */
export function applyEmailTld(value: string, tld: string): string {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at < 0) return trimmed;
  const local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1).replace(TLD_RE, "");
  if (!domain) return trimmed;
  const suffix = (tld.startsWith(".") ? tld : `.${tld}`).toLowerCase();
  return `${local}@${domain}${suffix}`;
}

export function emailHasDomain(value: string): boolean {
  const at = value.indexOf("@");
  return at >= 0 && at < value.length - 1;
}
