"use client";

import { useActionState } from "react";

import { signUp } from "./actions";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, null);

  return (
    <form action={formAction} className="sign-in-form">
      <label htmlFor="name">Nome</label>
      <input id="name" name="name" type="text" autoComplete="name" required />

      <label htmlFor="email">E-mail autorizado</label>
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
        autoComplete="new-password"
        minLength={8}
        required
      />

      {state?.error ? (
        <p className="form-error" role="alert">{state.error}</p>
      ) : null}

      <button type="submit" disabled={pending}>
        {pending ? "Criando conta…" : "Criar conta"}
      </button>
    </form>
  );
}
