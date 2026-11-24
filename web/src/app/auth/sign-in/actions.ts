"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";

export type SignInState = { error: string } | null;

export async function signIn(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe seu e-mail e sua senha." };
  }

  const { error } = await auth.signIn.email({ email, password });

  if (error) {
    return { error: "Não foi possível entrar. Confira os dados e tente novamente." };
  }

  redirect("/");
}
