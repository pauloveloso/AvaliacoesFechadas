"use server";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";

export type SignUpState = { error: string } | null;

export async function signUp(
  _previousState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const ownerEmail = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();

  if (!ownerEmail || email !== ownerEmail) {
    return { error: "O cadastro está restrito ao e-mail autorizado pelo professor." };
  }

  if (!name || password.length < 8) {
    return { error: "Informe seu nome e uma senha com pelo menos 8 caracteres." };
  }

  const { error } = await auth.signUp.email({ email, name, password });

  if (error) {
    return { error: error.message || "Não foi possível criar a conta." };
  }

  redirect("/");
}
