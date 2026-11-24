import Link from "next/link";

import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" aria-label="Avalia">
          <span className="brand-symbol">a</span>
          <span className="brand-name">avalia<span>.</span></span>
        </Link>
        <p className="auth-kicker">PRIMEIRO ACESSO</p>
        <h1>Crie sua conta</h1>
        <p className="auth-description">
          O cadastro aceita somente o e-mail definido pelo professor.
        </p>
        <SignUpForm />
        <p className="auth-switch">
          Já tem uma conta? <Link href="/auth/sign-in">Entrar</Link>
        </p>
      </section>
    </main>
  );
}
