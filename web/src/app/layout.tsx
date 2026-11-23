import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avalia — avaliações fechadas",
  description:
    "Organize questões, gere versões de avaliações e corrija por foto.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
