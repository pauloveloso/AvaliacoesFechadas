import { Suspense } from "react";
import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/server";

const steps = [
  {
    number: "01",
    title: "Organize disciplinas e conteúdos",
    description:
      "Cadastre períodos letivos, disciplinas e os conteúdos de cada disciplina.",
    status: "Concluído",
  },
  {
    number: "02",
    title: "Cadastre seu banco de questões",
    description:
      "Inclua enunciados, alternativas e gabaritos em cada tipo de questão.",
    status: "Concluído",
  },
  {
    number: "03",
    title: "Gere e corrija os pacotes",
    description:
      "Monte versões, imprima com QR code e corrija pela foto do celular.",
    status: "Próximo passo",
  },
];

export default function Home() {
  return (
    <Suspense fallback={<main className="app-shell">Carregando seu espaço…</main>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection();
  const user = await requireUser();

  return (
    <AppShell user={user} active="overview" breadcrumb="Visão geral">
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
              <article className={`step-card ${index === 2 ? "step-first" : ""}`} key={step.number}>
                <div className="step-card-top">
                  <span className="step-number">{step.number}</span>
                  <span className={`step-status ${index === 2 ? "current" : ""}`}>
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
            <div className="action-icon"><span className="mark">▦</span></div>
            <div className="action-copy">
              <h2>Monte seu primeiro pacote</h2>
              <p>Defina as questões, a quantidade de versões e o valor de cada posição da avaliação.</p>
            </div>
            <a className="action-badge" href="/pacotes">ABRIR PACOTES</a>
          </section>

          <footer className="footer-note">
            <span className="footer-mark">a.</span>
            <span>Feito para preparar avaliações com clareza.</span>
            <span className="footer-version">VERSÃO INICIAL</span>
          </footer>
    </AppShell>
  );
}
