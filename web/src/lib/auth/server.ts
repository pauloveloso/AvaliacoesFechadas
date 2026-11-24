import { createNeonAuth } from "@neon/auth/next/server";
import { redirect } from "next/navigation";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

export async function requireUser() {
  const { data } = await auth.getSession();
  const ownerEmail = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();

  if (!data?.user) redirect("/auth/sign-in");
  if (!ownerEmail || data.user.email?.toLowerCase() !== ownerEmail) {
    redirect("/auth/acesso-negado");
  }

  return data.user;
}
