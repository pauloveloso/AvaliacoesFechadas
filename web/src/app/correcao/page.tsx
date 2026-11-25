import { connection } from "next/server";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/server";
import { CorrectionClient } from "./correction-client";

export default async function CorrectionPage() {
  await connection();
  const user = await requireUser();

  return (
    <AppShell user={user} active="correction" breadcrumb="Correção por foto">
      <div className="page-heading">
        <div className="eyebrow dark">CORREÇÃO NO DISPOSITIVO</div>
        <h1>Corrigir avaliação</h1>
        <p>Fotografe o cartão de respostas. O QR identifica o gabarito e a leitura é processada neste aparelho.</p>
      </div>
      <CorrectionClient />
    </AppShell>
  );
}
