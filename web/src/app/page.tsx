const steps = [
  {
    number: "01",
    title: "Organize por categoria",
    description:
      "Crie categorias como Condicional SE, Repetição Para e Vetores.",
    status: "Primeiro passo",
  },
  {
    number: "02",
    title: "Monte seu banco de questões",
    description:
      "Cadastre alternativas e gabaritos separados por posição da prova.",
    status: "Em seguida",
  },
  {
    number: "03",
    title: "Gere e corrija os pacotes",
    description:
      "Monte versões, imprima com QR code e corrija pela foto do celular.",
    status: "Depois",
  },
];

function Mark({ children }: { children: React.ReactNode }) {
  return <span className="mark">{children}</span>;
}

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Avalia, página inicial">
          <span className="brand-symbol">a</span>
          <span className="brand-name">avalia<span>.</span></span>
        </a>

        <div className="sidebar-label">ESPAÇO DO PROFESSOR</div>
        <nav aria-label="Navegação principal">
          <a className="nav-item active" href="/" aria-current="page">
            <Mark>⌂</Mark> Visão geral
          </a>
          <span className="nav-item muted"><Mark>▦</Mark> Categorias</span>
          <span className="nav-item muted"><Mark>▤</Mark> Questões</span>
          <span className="nav-item muted"><Mark>▧</Mark> Pacotes de provas</span>
          <span className="nav-item muted"><Mark>◉</Mark> Correção</span>
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-avatar">P</div>
          <div className="profile-copy">
            <strong>Professor</strong>
            <span>Área de trabalho pessoal</span>
          </div>
          <span className="profile-menu" aria-hidden="true">···</span>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Início <span>/</span> Visão geral</div>
          <div className="topbar-note"><span className="status-dot" /> Seu espaço de avaliações</div>
        </header>

        <div className="content">
          <section className="welcome">
            <div className="welcome-copy">
              <div className="eyebrow"><span /> SEU ESPAÇO DE TRABALHO</div>
              <h1>Boas-vindas ao <em>Avalia</em></h1>
              <p>
                Organize suas questões, gere versões equivalentes e corrija
                avaliações fechadas em um só lugar.
              </p>
            </div>
            <div className="welcome-illustration" aria-hidden="true">
              <div className="paper paper-back" />
              <div className="paper paper-front">
                <div className="paper-top"><span /><span /></div>
                <div className="paper-title-line" />
                <div className="paper-rule" />
                <div className="paper-question"><b>1.</b><i /><i /><i /></div>
                <div className="paper-question"><b>2.</b><i /><i /><i /></div>
                <div className="paper-qr"><span /><span /><span /><span /><span /></div>
              </div>
              <div className="sparkle sparkle-one">✳</div>
              <div className="sparkle sparkle-two">✦</div>
            </div>
          </section>

          <div className="section-heading">
            <div>
              <div className="eyebrow dark">COMECE POR AQUI</div>
              <h2>Um fluxo simples, do cadastro à correção</h2>
            </div>
            <span className="step-count">3 etapas</span>
          </div>

          <section className="steps-grid" aria-label="Etapas do sistema">
            {steps.map((step, index) => (
              <article className={`step-card ${index === 0 ? "step-first" : ""}`} key={step.number}>
                <div className="step-card-top">
                  <span className="step-number">{step.number}</span>
                  <span className={`step-status ${index === 0 ? "current" : ""}`}>
                    {step.status}
                  </span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <div className="step-line"><span style={{ width: `${(index + 1) * 33.33}%` }} /></div>
              </article>
            ))}
          </section>

          <section className="first-action">
            <div className="action-icon"><Mark>▦</Mark></div>
            <div className="action-copy">
              <h2>Vamos começar pelas categorias</h2>
              <p>O próximo passo é definir uma categoria e quantas questões cada avaliação terá.</p>
            </div>
            <span className="action-badge">PRÓXIMO PASSO</span>
          </section>

          <footer className="footer-note">
            <span className="footer-mark">a.</span>
            <span>Feito para preparar avaliações com clareza.</span>
            <span className="footer-version">VERSÃO INICIAL</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
