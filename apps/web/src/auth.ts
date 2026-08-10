import { useEffect, useState } from "react";
import { API_URL } from "./config.ts";

export function useBffSession(initialAuthenticated?: boolean) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated ?? false);
  const [checking, setChecking] = useState(initialAuthenticated === undefined);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (initialAuthenticated !== undefined) return;
    void fetch(`${API_URL}/auth/session`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível verificar sua sessão.");
        const session = (await response.json()) as { authenticated: boolean };
        setAuthenticated(session.authenticated);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Não foi possível verificar sua sessão.");
      })
      .finally(() => setChecking(false));
  }, [initialAuthenticated]);

  const beginLogin = () => {
    try {
      const login = new URL("/auth/login", API_URL);
      login.searchParams.set("returnTo", window.location.href);
      window.location.assign(login);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível iniciar o login.");
    }
  };

  const logout = async (): Promise<boolean> => {
    setError(""); setStatus(""); setLoggingOut(true);
    try {
      const response = await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Não foi possível encerrar sua sessão.");
      setAuthenticated(false);
      setStatus("Sessão encerrada. Você pode entrar novamente quando quiser.");
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível encerrar sua sessão.");
      return false;
    } finally { setLoggingOut(false); }
  };

  return { authenticated, checking, error, status, loggingOut, beginLogin, logout };
}
