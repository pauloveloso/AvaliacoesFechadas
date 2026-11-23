# Avalia

Aplicação pessoal para cadastrar questões fechadas, montar versões de avaliações e corrigir respostas pela foto do celular.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. Sem configuração do Neon, a aplicação mostra a página de configuração inicial.

## Neon

Crie um projeto Neon com Neon Auth habilitado. Copie a connection string do PostgreSQL e a URL do Neon Auth para `.env.local`, que não deve ser versionado:

```env
DATABASE_URL=
NEON_AUTH_BASE_URL=
NEON_AUTH_COOKIE_SECRET=
```

Gere `NEON_AUTH_COOKIE_SECRET` com pelo menos 32 caracteres aleatórios (por exemplo, `openssl rand -base64 32`). A connection string e o segredo de cookies são privados e só podem ser usados no servidor.

Aplique `neon/migrations/202611230001_initial_question_bank.sql` no SQL Editor do Neon. O banco é acessado exclusivamente pelo servidor Next.js; nenhum cliente do navegador recebe `DATABASE_URL`.

## Etapas de desenvolvimento

1. Login do professor e cadastro de categorias/posições.
2. Cadastro e edição de questões, alternativas e gabaritos.
3. Geração de pacotes com snapshots e valores por questão.
4. PDF A4 com QR code e grade de respostas no cabeçalho.
5. Leitura das fotos no navegador e revisão de marcações ambíguas.
