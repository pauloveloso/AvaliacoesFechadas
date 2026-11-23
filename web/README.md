# Avalia

Aplicação pessoal para cadastrar questões fechadas, montar versões de avaliações e corrigir respostas pela foto do celular.

## Desenvolvimento local

Requisitos: Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>.

## Banco Supabase

A estrutura inicial está em `supabase/migrations/202611230001_initial_question_bank.sql`. Ela cria categorias, posições fixas de questão e alternativas, com acesso restrito ao usuário autenticado por políticas RLS.

Depois de criar o projeto Supabase, configure as variáveis de ambiente em `.env.local` (não versionar esse arquivo):

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

A primeira etapa funcional será conectar o login do professor e o cadastro de categorias. A tela inicial atual é apenas a estrutura visual do produto.

## Etapas de desenvolvimento

1. Login do professor e cadastro de categorias/posições.
2. Cadastro e edição de questões, alternativas e gabaritos.
3. Geração de pacotes com snapshots e valores por questão.
4. PDF A4 com QR code e grade de respostas no cabeçalho.
5. Leitura das fotos no navegador e revisão de marcações ambíguas.
