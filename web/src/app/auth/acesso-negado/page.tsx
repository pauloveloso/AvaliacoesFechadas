import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="auth-kicker">ACESSO RESTRITO</p>
        <h1>Esta conta não está autorizada</h1>
        <p className="auth-description">
          Entre com o e-mail definido pelo professor para este sistema.
        </p>
        <Link className="auth-link-button" href="/auth/sign-in">Voltar ao login</Link>
      </section>
    </main>
  );
}
