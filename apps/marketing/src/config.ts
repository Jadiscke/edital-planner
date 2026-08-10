const DEFAULT_SIGNUP_ROUTE = "/app/";

export function getPublicSignupUrl(envValue = import.meta.env.PUBLIC_SIGNUP_URL): string {
  const candidate = envValue?.trim() || DEFAULT_SIGNUP_ROUTE;

  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;

  const url = new URL(candidate);
  if (url.protocol !== "https:") {
    throw new Error("PUBLIC_SIGNUP_URL must be a relative route or an HTTPS URL");
  }

  return url.toString();
}
