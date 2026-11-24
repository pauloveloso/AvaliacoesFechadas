# Avalia

Aplicação pessoal para cadastrar questões fechadas, montar versões de avaliações e corrigir respostas pela foto do celular.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. O app exige as variáveis do Neon em `.env.local`.

## Neon

O projeto está vinculado ao branch `production` do Neon por `neon.ts` e `.neon`. Para atualizar as variáveis locais e aplicar a configuração dos serviços, use `npx neon@latest deploy`. O app usa Neon Auth para login e `pg` com Vercel Fluid para consultas ao PostgreSQL.

O Neon CLI preenche as variáveis de banco e Auth em `.env.local`. Defina também o e-mail autorizado para criar conta e acessar o sistema:

```env
NEON_AUTH_COOKIE_SECRET=
APP_OWNER_EMAIL=voce@exemplo.com
```

Gere `NEON_AUTH_COOKIE_SECRET` com pelo menos 32 caracteres aleatórios (por exemplo, `openssl rand -base64 32`). A connection string e o segredo de cookies são privados e só podem ser usados no servidor. O cadastro é limitado a `APP_OWNER_EMAIL`.

As migrações usam a conexão direta `DATABASE_URL_UNPOOLED`; o tráfego do app usa `DATABASE_URL`. O banco é acessado exclusivamente pelo servidor Next.js; nenhum cliente do navegador recebe a connection string.

## Etapas de desenvolvimento

1. Login do professor e cadastro de categorias/posições.
2. Cadastro e edição de questões, alternativas e gabaritos.
3. Geração de pacotes com snapshots e valores por questão.
4. PDF A4 com QR code e grade de respostas no cabeçalho.
5. Leitura das fotos no navegador e revisão de marcações ambíguas.
