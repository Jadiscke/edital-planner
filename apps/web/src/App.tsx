import { Provider as ReduxProvider } from "react-redux";

import { useBffSession } from "./auth.ts";
import { ProjectComposer } from "./components/ProjectComposer.tsx";
import { AccountLogin, ProjectWorkspace } from "./components/AccountProjectExperience.tsx";
import { createAppStore, projectsApi } from "./state.ts";
const store = createAppStore();

function BrandHeader({ authenticated, loggingOut, error, onLogout }: { authenticated: boolean; loggingOut: boolean; error: string; onLogout: () => void }) {
  return (
    <header className="brand-header">
      <a className="brand" href="/" aria-label="Planejador de Editais — início"><i aria-hidden="true">P</i><span>Planejador<br />de Editais</span></a>
      {authenticated ? <div className="session-controls">
        <span className="secure-session">Sessão Protegida</span>
        <button className="logout-action" type="button" disabled={loggingOut} onClick={onLogout}>{loggingOut ? "Saindo…" : "Sair"}</button>
        {error ? <p role="alert">{error}</p> : null}
      </div> : null}
    </header>
  );
}

export function App({ initialAuthenticated }: { initialAuthenticated?: boolean }) {
  const session = useBffSession(initialAuthenticated);
  const logout = async () => {
    if (await session.logout()) store.dispatch(projectsApi.util.resetApiState());
  };

  return (
    <>
      <a className="skip-link" href="#main">Ir para o conteúdo</a>
      <BrandHeader authenticated={session.authenticated && !session.checking} loggingOut={session.loggingOut} error={session.authenticated ? session.error : ""} onLogout={() => { void logout(); }} />
      {session.checking ? (
        <main id="main" className="session-loading" role="status" aria-live="polite">Verificando Sessão…</main>
      ) : session.authenticated ? (
        <ReduxProvider store={store}>
          <ProjectComposer.Provider><ProjectWorkspace /></ProjectComposer.Provider>
        </ReduxProvider>
      ) : (
        <AccountLogin onLogin={session.beginLogin} error={session.error} status={session.status} />
      )}
    </>
  );
}
