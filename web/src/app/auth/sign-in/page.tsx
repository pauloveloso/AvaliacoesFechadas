import Link from "next/link";

import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" aria-label="Avalia">
          <span className="brand-symbol">a</span>
          <span className="brand-name">avalia<span>.</span></span>
        </Link>
        <p className="auth-kicker">ESPAÇO DO PROFESSOR</p>
        <h1>Acesse suas avaliações</h1>
        <p className="auth-description">Entre com a conta criada no Neon Auth.</p>
        <SignInForm />
      </section>
    </main>
  );
}
