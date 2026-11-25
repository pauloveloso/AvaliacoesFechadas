"use client";

import { useActionState } from "react";

import { signIn } from "./actions";

export function SignInForm({ returnTo = "/" }: { returnTo?: string }) {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <form action={formAction} className="sign-in-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label htmlFor="email">E-mail</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="voce@exemplo.com"
        required
      />

      <label htmlFor="password">Senha</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Sua senha do Neon Auth"
        required
      />

      {state?.error ? (
        <p className="form-error" role="alert">{state.error}</p>
      ) : null}

      <button type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar no Avalia"}
      </button>
    </form>
  );
}
