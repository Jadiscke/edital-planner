import { EditalSpine } from "./EditalSpine.tsx";
import { ProjectComposer } from "./ProjectComposer.tsx";

export function AccountLogin({ onLogin, error, status }: { onLogin: () => void; error: string; status: string }) {
  return (
    <main id="main" className="login account-login">
      <section className="login-thesis">
        <p className="eyebrow">Do edital ao estudo de hoje</p>
        <h1>Seu concurso deixa de ser um documento e vira caminho.</h1>
        <p>Entre para organizar concurso, cargo e área em uma trilha que preserva cada decisão.</p>
        <button className="primary-action" type="button" onClick={onLogin}>Entrar ou Criar Conta</button>
        <p className="login-note">Login seguro pelo seu provedor OIDC. A aplicação não recebe sua senha.</p>
        <p role="alert">{error}</p>
        <p role="status" aria-live="polite">{status}</p>
      </section>
      <aside className="login-preview" aria-label="Prévia da transformação do edital">
        <span>EDITAL</span>
        <div className="preview-spine"><i /><i /><i /><i /></div>
        <strong>TRILHA</strong>
      </aside>
    </main>
  );
}

export function ProjectWorkspace() {
  return (
    <main id="main" className="workspace project-workspace">
      <section className="form-intro">
        <p className="eyebrow">Primeiro Projeto</p>
        <h1>Qual edital vai guiar seus próximos estudos?</h1>
        <p>Registre o objetivo exatamente como você o reconhece. Você poderá anexar e verticalizar o edital depois.</p>
        <div className="form-grid">
          <ProjectComposer.Field name="concurso" label="Concurso" example="TRF 4ª Região" />
          <ProjectComposer.Field name="cargo" label="Cargo" example="Analista Judiciário" />
          <ProjectComposer.Field name="area" label="Área" example="Judiciária" />
        </div>
        <ProjectComposer.Submit />
        <ProjectComposer.Status />
      </section>
      <aside className="study-sheet">
        <p className="sheet-label">ESPINHA DO EDITAL</p>
        <EditalSpine />
        <div className="sheet-projects">
          <h2>Projetos</h2>
          <ProjectComposer.ProjectShelf />
        </div>
      </aside>
    </main>
  );
}
