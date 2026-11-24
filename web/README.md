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

### Imagens nas questões

As imagens ficam em um Blob privado da Vercel; o banco guarda apenas o caminho e os metadados. A aplicação aceita até 3 imagens JPEG, PNG ou WebP por questão, com até 1 MB cada. A região `sa-east-1` deste projeto Neon não está entre as regiões atendidas pelo Object Storage do Neon.

No projeto Vercel, abra **Storage → Create Storage → Blob**, crie um store **Private** e conecte-o aos ambientes **Production**, **Preview** e **Development**. Inclua `BLOB_READ_WRITE_TOKEN` na conexão. Para desenvolvimento local, vincule a pasta com `vercel link` se necessário e execute `vercel env pull .env.local` dentro da pasta `web`. O SDK usa OIDC automaticamente nos deploys conectados à Vercel. O plano Hobby inclui 1 GB de armazenamento, 2.000 operações de escrita e 10 GB de transferência por mês; ao exceder a franquia, o recurso fica indisponível até o próximo período sem gerar cobrança adicional nesse plano.

A migração `202611240003_question_images.sql` cria a tabela de metadados e já foi aplicada ao branch `production`.

### Hierarquia de cadastros

As migrações `202611240001_academic_hierarchy.sql` e `202611240002_question_bank.sql` criam a hierarquia e o banco de questões ligados por tipo. Ambas já foram aplicadas no branch `production`; em qualquer novo ambiente, aplique os arquivos em ordem. A segunda preserva as antigas tabelas vazias como `legacy_questions` e `legacy_question_options`.

### Pacotes de provas

Em **Pacotes de provas**, escolha período, disciplina, conteúdo, tipo, dificuldade, valor e quantidade de versões. A geração seleciona questões ativas do nível escolhido, prefere itens diferentes entre versões e grava snapshots das questões, alternativas, imagens e gabaritos. Estão disponíveis dois PDFs por pacote: o caderno para alunos, com campos de identificação e grade vazia de respostas, e o gabarito do professor. Os códigos QR e a correção por foto serão adicionados em etapa posterior.

A migração `202611240004_exam_packages.sql` cria o armazenamento de pacotes, versões, valores por posição e snapshots, e já foi aplicada ao branch `production`.

## Etapas de desenvolvimento

1. Login do professor e cadastro de períodos letivos, disciplinas, conteúdos e tipos de questão.
2. Cadastro e edição de questões, alternativas, gabaritos e imagens.
3. Geração de pacotes com snapshots, valores por questão e PDFs de provas/gabaritos.
4. QR code individual por prova e grade de respostas no cabeçalho.
5. Leitura das fotos no navegador e revisão de marcações ambíguas.
