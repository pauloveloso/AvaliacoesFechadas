import type { ReactNode } from "react";

import { signOut } from "@/app/auth/sign-out/actions";

type AppUser = { name: string | null; email: string };
type AppSection = "overview" | "cadastros" | "questions" | "packages";

function Mark({ children }: { children: ReactNode }) {
  return <span className="mark">{children}</span>;
}

export function AppShell({
  user,
  active,
  breadcrumb,
  children,
}: {
  user: AppUser;
  active: AppSection;
  breadcrumb: string;
  children: ReactNode;
}) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Avalia, página inicial">
          <span className="brand-symbol">a</span>
          <span className="brand-name">avalia<span>.</span></span>
        </a>

        <div className="sidebar-label">ESPAÇO DO PROFESSOR</div>
        <nav aria-label="Navegação principal">
          <a
            className={`nav-item ${active === "overview" ? "active" : "muted"}`}
            href="/"
            aria-current={active === "overview" ? "page" : undefined}
          >
            <Mark>⌂</Mark> Visão geral
          </a>
          <a
            className={`nav-item ${active === "cadastros" ? "active" : "muted"}`}
            href="/categorias"
            aria-current={active === "cadastros" ? "page" : undefined}
          >
            <Mark>▦</Mark> Cadastros
          </a>
          <a
            className={`nav-item ${active === "questions" ? "active" : "muted"}`}
            href="/questoes"
            aria-current={active === "questions" ? "page" : undefined}
          >
            <Mark>▤</Mark> Questões
          </a>
          <a
            className={`nav-item ${active === "packages" ? "active" : "muted"}`}
            href="/pacotes"
            aria-current={active === "packages" ? "page" : undefined}
          >
            <Mark>▧</Mark> Pacotes de provas
          </a>
          <span className="nav-item muted"><Mark>◉</Mark> Correção</span>
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-avatar">P</div>
          <div className="profile-copy">
            <strong>{user.name || "Professor"}</strong>
            <span>{user.email}</span>
          </div>
          <form action={signOut}>
            <button className="sign-out-button" type="submit" aria-label="Encerrar sessão">
              <span aria-hidden="true">↪</span><span className="sign-out-label">Sair</span>
            </button>
          </form>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Início <span>/</span> {breadcrumb}</div>
          <div className="topbar-note"><span className="status-dot" /> Seu espaço de avaliações</div>
        </header>
        <div className="content">{children}</div>
      </section>
    </main>
  );
}
