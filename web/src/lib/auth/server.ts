import { createNeonAuth } from "@neondatabase/auth/next/server";
import { redirect } from "next/navigation";

export function getAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!baseUrl || !secret) {
    throw new Error("Configure as variáveis do Neon Auth no arquivo .env.local.");
  }

  return createNeonAuth({
    baseUrl,
    cookies: { secret },
  });
}

export async function requireUser() {
  const { data } = await getAuth().getSession();

  if (!data?.user) redirect("/auth/sign-in");

  return data.user;
}
