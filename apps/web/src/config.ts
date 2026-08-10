function configuredApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured) {
    if (import.meta.env.PROD) return window.location.origin;
    return "http://127.0.0.1:3001";
  }
  const url = new URL(configured);
  if (import.meta.env.PROD && url.protocol !== "https:") throw new Error("VITE_API_URL must use HTTPS in production");
  return url.origin;
}

export const API_URL = configuredApiUrl();
