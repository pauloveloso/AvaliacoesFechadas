import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";
import { SignInForm } from "./sign-in-form";

export default function SignInPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  return <Suspense fallback={<main className="auth-shell">Carregando…</main>}><SignInContent searchParams={searchParams} /></Suspense>;
}

async function SignInContent({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  await connection();
  const params = await searchParams;
  const returnTo = params.redirectTo && /^\/consulta\/[0-9a-f-]{36}$/i.test(params.redirectTo)
    ? params.redirectTo
    : "/";
  const { data } = await auth.getSession();
  if (data?.user) redirect(returnTo);
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand auth-brand" href="/" aria-label="Avalia">
          <span className="brand-symbol">a</span>
          <span className="brand-name">avalia<span>.</span></span>
        </Link>
        <p className="auth-kicker">ESPAÇO DO PROFESSOR</p>
        <h1>Acesse suas avaliações</h1>
        <p className="auth-description">
          {returnTo.startsWith("/consulta/")
            ? "Entre para consultar o gabarito desta avaliação."
            : "Entre com a conta criada no Neon Auth."}
        </p>
        <SignInForm returnTo={returnTo} />
        <p className="auth-switch">
          Primeiro acesso? <Link href="/auth/sign-up">Criar conta</Link>
        </p>
      </section>
    </main>
  );
}
