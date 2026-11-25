# Avalia — guia de continuidade do desenvolvimento

**Atualizado em:** 25/11/2026

**Repositório:** projeto `AvaliacoesFechadas`

**Aplicação Next.js:** pasta `web/`

## 1. Resumo executivo

Avalia é uma aplicação pessoal para um professor cadastrar questões fechadas, montar versões equivalentes de avaliações e, futuramente, corrigi-las pela foto tirada no celular. A organização dos cadastros é:

> Período letivo → disciplina ofertada → conteúdo → tipo de questão → questões

As avaliações têm até 10 questões. Cada posição do pacote define um tipo de questão, uma dificuldade e um valor em pontos. O sistema monta até 30 versões, gera um PDF das provas e outro do gabarito do professor e congela snapshots do conteúdo usado. A autenticação permite o acesso somente ao e-mail configurado como proprietário.

**Estado atual:** cadastros, banco de questões com imagens, montagem de pacotes, snapshots, instruções e PDFs estão implementados. O módulo inicial de correção por foto lê o QR e a grade localmente no navegador, calcula a nota e permite revisar respostas incertas; ainda não registra o resultado no banco.

## 2. Regras do produto já decididas

- O sistema é para uso individual do professor; não há fluxo de turmas/alunos nem gestão de múltiplos professores ainda.
- A lista de disciplinas pode mudar por período. A disciplina é reutilizável e sua oferta é associada ao período letivo.
- Cada conteúdo pertence a uma disciplina; cada tipo de questão pertence a um conteúdo e define o formato e a quantidade de alternativas (2 a 8 no esquema atual).
- Cada questão tem uma única alternativa correta e uma dificuldade (`easy`, `medium`, `hard`).
- O professor escolhe a quantidade de posições (1 a 10), o tipo, a dificuldade e a pontuação de cada posição, além da quantidade de versões (1 a 30).
- Questões podem ser reutilizadas em diferentes provas. A estrutura, a dificuldade e os pontos de cada posição são iguais entre as versões do mesmo pacote.
- Provas geradas são snapshots: alterações futuras no banco de questões não alteram as provas e os gabaritos já gerados.
- Cada versão tem um token QR opaco e único. O QR impresso leva o gabarito e os pontos necessários para correção offline; ele não é um mecanismo de autenticação.
- A leitura por foto está planejada para acontecer no navegador do celular, com processamento da imagem no cliente e revisão manual de marcações duvidosas.

## 3. Tecnologias e implantação

| Área | Tecnologia/serviço | Uso atual |
|---|---|---|
| Aplicação | Next.js 16, React 19, TypeScript | Páginas, Server Actions e rotas de API |
| Hospedagem | Vercel | Deploy da aplicação Next.js |
| Banco | Neon PostgreSQL | Hierarquia, banco de questões, pacotes e snapshots |
| Login | Neon Auth | Sessão e autenticação do professor |
| Driver | `pg` com `@vercel/functions` | Pool PostgreSQL reutilizado no runtime Vercel |
| Imagens das questões | Vercel Blob privado | Arquivos; o Postgres guarda caminhos e metadados |
| PDF | PDFKit | PDFs dos alunos e gabaritos do professor |
| Tratamento de imagens no PDF | `sharp` | Normalização e inclusão de imagens do Blob nos PDFs |

O projeto Neon está no branch `production`. A região `sa-east-1` não está entre as regiões atendidas pelo Object Storage do Neon; por isso as imagens usam Vercel Blob privado. O banco e os segredos são acessados apenas no servidor.

## 4. Estrutura útil do repositório

```text
docs/
  arquitetura-inicial.md                 visão de arquitetura anterior
  Modelo.pdf                              referência visual da avaliação
  Logo IF/                                arquivos de marca fornecidos
  guia-de-continuidade.md                 este documento
web/
  src/app/
    auth/                                 entrada, cadastro restrito e saída
    categorias/                           período, disciplina, conteúdo e tipo
    questoes/                             editor e listagem do banco de questões
    pacotes/                              configuração e histórico dos pacotes
    api/auth/[...path]/                   integração da rota do Neon Auth
    api/questoes/imagens/[imageId]/       leitura autenticada de imagem privada
    api/pacotes/[packageId]/pdf/          geração/download de PDF
  src/components/app-shell.tsx            navegação e moldura autenticada
  src/lib/auth/server.ts                  Neon Auth e validação do proprietário
  src/lib/db.ts                            pool PostgreSQL do servidor
  src/lib/pdf/exam-package-pdf.ts          layout dos PDFs
  src/proxy.ts                             middleware de autenticação
  public/branding/ifnmg-horizontal.png     logomarca usada no PDF
  neon/migrations/                         SQL versionado
  next.config.ts                           tracing da marca na rota PDF
  .env.example                             nomes das variáveis esperadas
```

`web/AGENTS.md` orienta consultar a documentação Next.js instalada em `web/node_modules/next/dist/docs/` antes de mudar APIs ou convenções do framework. A configuração atual usa `connection()` em páginas dinâmicas e Cache Components.

## 5. Fluxos e arquivos principais

### Autenticação e acesso

- `src/lib/auth/server.ts` cria o Neon Auth server-side e exporta `requireUser()`.
- `requireUser()` redireciona usuários não autenticados e também bloqueia qualquer e-mail diferente de `APP_OWNER_EMAIL`.
- `src/proxy.ts` protege a aplicação, exceto as rotas públicas declaradas (`/configurar-neon` e `/auth/acesso-negado`).
- O cadastro também valida o e-mail autorizado em `src/app/auth/sign-up/actions.ts`.
- Toda nova Server Action/rota que leia dados particulares deve exigir sessão e validar o e-mail do proprietário.

### Cadastros

`src/app/categorias/page.tsx` e `actions.ts` mantêm:

1. períodos letivos;
2. disciplinas existentes e associações disciplina-período;
3. conteúdos da disciplina;
4. tipos de questão do conteúdo, com formato e quantidade de alternativas.

### Banco de questões

`src/app/questoes/page.tsx` e `actions.ts` permitem cadastrar, editar, ativar/desativar e paginar questões. O enunciado preserva quebras de linha e código. As alternativas são ordenadas e uma é marcada como correta. A explicação é opcional.

Imagens: até 3 arquivos JPEG, PNG ou WebP por questão, 1 MB cada. A action verifica MIME e assinatura dos bytes, envia os arquivos ao Blob privado e grava metadados em `question_images`. A rota `api/questoes/imagens/[imageId]` exige autenticação antes de devolver o arquivo. Na exclusão/substituição de imagens, o código também administra o Blob.

### Montagem do pacote

- Tela: `src/app/pacotes/page.tsx`.
- Action: `src/app/pacotes/actions.ts`.
- O formulário escolhe período, disciplina e conteúdo; nome do pacote; quantidade de versões (1–30); quantidade de questões (1–10); e tipo, dificuldade e valor de cada posição.
- O campo **Instrução específica (opcional)** aceita até 500 caracteres. É salvo no pacote e impresso junto das instruções básicas.
- A action confirma que o conteúdo pertence à disciplina/período e que os tipos pertencem ao conteúdo. Só usa questões ativas da dificuldade indicada, com número de alternativas esperado e exatamente uma correta.
- A geração é transacional. Cada versão e questão é persistida em `exam_versions` e `exam_version_questions`.
- Questões com imagens têm cópias privadas criadas em caminhos do pacote, e esses caminhos são salvos no snapshot para preservar os PDFs depois de alterações no banco de origem.
- As imagens são apagadas se uma transação de geração falhar depois de copiá-las.
- O histórico oferece links separados para “Provas PDF” e “Gabaritos PDF”.

**Seleção atual:** as questões candidatas são ordenadas das mais novas para as mais antigas. O índice é rotacionado por versão e posição (incluindo posições do mesmo tipo), tentando variar o conteúdo; quando o banco não tem questões suficientes, reutiliza itens. A seleção é determinística, não aleatória, e atualmente não embaralha as alternativas.

### PDFs

- Endpoint autenticado: `src/app/api/pacotes/[packageId]/pdf/route.ts`.
- `?document=provas` gera o caderno combinado das versões; `?document=gabaritos` gera o material do professor.
- A resposta usa `Content-Disposition: attachment` (download).
- Gerador: `src/lib/pdf/exam-package-pdf.ts`.
- A capa/primeira página da prova segue a estrutura definida pelo professor: marca IFNMG, Campus Januária, linha, “Atividade Avaliativa de [disciplina]”, nome, turma, instruções e cartão de respostas com QR à esquerda e grade à direita. O QR usa JSON compacto: `v` (schema 1), `g` (layout da grade 2), `t` (token), `a` (opção correta 1-based por questão), `c` (quantidade de alternativas) e `p` (pontos em centésimos). A versão não aparece impressa.
- As instruções básicas impressas orientam preencher o cartão com caneta preta ou azul e pintar uma bolha por questão.
- Nas páginas seguintes da prova, o cabeçalho tem a atividade e uma linha. Uma linha fina é desenhada no rodapé de todas as páginas.
- O cartão de respostas imprime uma linha por questão e bolhas para as alternativas existentes (até A–H), com quatro marcadores pretos nos cantos da região para alinhamento da foto. As alternativas do enunciado não têm bolhas, evitando confusão com a área OMR.
- Nas provas dos alunos, a versão não aparece impressa. As questões são diagramadas em duas colunas desde a primeira página, separadas por linha vertical; os textos principais usam fonte maior e contraste reforçado. As continuações mostram apenas “Atividade Avaliativa de [disciplina]” e linha separadora.
- O PDF do professor lista as respostas e explicações disponíveis.
- Para que a imagem da marca seja incluída no runtime da rota na Vercel, `next.config.ts` configura `outputFileTracingIncludes` para `/api/pacotes/[packageId]/pdf`.

## 6. Modelo de dados

O schema está em `web/neon/migrations/`:

| Tabela | Papel |
|---|---|
| `academic_terms` | Períodos letivos |
| `disciplines` | Disciplinas reutilizáveis |
| `term_disciplines` | Disciplinas oferecidas em cada período |
| `contents` | Conteúdos ligados à disciplina |
| `question_types` | Tipo/formato e número de alternativas ligados ao conteúdo |
| `questions` | Enunciado JSON, explicação, dificuldade e estado ativo |
| `question_options` | Alternativas JSON ordenadas e indicador da correta |
| `question_images` | Caminho privado no Blob, MIME, tamanho, texto alternativo e ordem |
| `exam_packages` | Contexto do pacote, título, contagens, total e instrução específica |
| `exam_package_slots` | Tipo, dificuldade e pontos de cada posição |
| `exam_versions` | Versões (A, B, C...) dentro do pacote |
| `exam_version_questions` | Snapshot imutável de enunciado, alternativas, resposta, explicação, imagens e pontos |

Há tabelas do esquema inicial mantidas como legado. `202611240002_question_bank.sql` renomeia as tabelas antigas vazias para `legacy_questions` e `legacy_question_options` antes de criar as tabelas atuais. Não remover legado sem verificar referências e dados.

### Migrações presentes

1. `202611230001_initial_question_bank.sql` — primeiro esquema legado por categoria e posição.
2. `202611240001_academic_hierarchy.sql` — período, disciplina, conteúdo e tipo.
3. `202611240002_question_bank.sql` — banco atual de questões/alternativas.
4. `202611240003_question_images.sql` — metadados de imagens.
5. `202611240004_exam_packages.sql` — pacote, posições, versões e snapshots.
6. `202611240005_exam_package_instructions.sql` — coluna `instructions` (`text`, até 500 caracteres, default vazio).

As migrações 001–004 foram aplicadas no Neon `production` em etapas anteriores. A migração 005 foi aplicada em 24/11/2026; a verificação confirmou que os três pacotes existentes foram preservados e receberam `instructions = ''`. Não há runner de migração configurado nos scripts npm. Para novas alterações, criar SQL versionado, testar em branch temporário do Neon, aplicar à produção usando conexão direta (`DATABASE_URL_UNPOOLED`) e verificar o schema.

## 7. Configuração e comandos

Requisito local: Node.js 22 ou superior. A aplicação fica em `web/`.

```bash
cd web
npm install
npm run dev
```

Next usa normalmente `http://localhost:3000`; se a porta estiver ocupada, pode iniciar em `3001`. Para compilar:

```bash
npm run build
```

Scripts definidos em `package.json`: `dev`, `build`, `start` e `lint`. Não há script `test` configurado.

Variáveis necessárias (nomes, nunca valores/secrets neste documento):

- `DATABASE_URL` — conexão normal da aplicação, pooled.
- `DATABASE_URL_UNPOOLED` — conexão direta para migrações e administração.
- `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`, `NEON_AUTH_COOKIE_SECRET`.
- `APP_OWNER_EMAIL` — único e-mail permitido.
- `BLOB_READ_WRITE_TOKEN` para Blob local, ou credenciais OIDC da integração Vercel nos deploys (`BLOB_STORE_ID`/`VERCEL_OIDC_TOKEN`).

O `npx neon@latest deploy` pode provisionar/atualizar os recursos declarados e sincronizar variáveis locais. Não versionar `.env.local`, connection strings, token Blob ou segredo de cookies. Na Vercel, configurar as variáveis nos ambientes usados. O build local desta configuração passou com `experimental.useTypeScriptCli: false`; não remover essa configuração sem revalidar o `npm run build` neste projeto/ambiente.

## 8. Próximas etapas recomendadas

### Módulo inicial de correção por foto

- Página `/correcao`, protegida pelo login do professor e acessível em celular.
- Captura pela câmera traseira ou escolha da foto; processamento no navegador, sem enviar a imagem.
- O QR informa token, gabarito, alternativas, pontuação e versão do layout OMR. QR de PDFs antigos sem `g: 2` precisa ser gerado novamente.
- Os quatro cantos do QR orientam a correção de perspectiva; a leitura estima as respostas por contraste e pede revisão em marcações incertas ou múltiplas.
- A página mostra respostas, gabarito, acertos e pontuação. Ainda não persiste resultados nem autentica a identidade do aluno.
- Um service worker tenta manter a página e os recursos estáticos carregados para uso offline após acesso autenticado com rede. Validar em celular/navegador alvo antes de depender do modo offline.

### Próxima etapa — registro dos resultados

- Calibrar a leitura com fotos reais: diferentes celulares, iluminação, inclinação e preenchimentos feitos a caneta.
- Persistir nome, token da versão, respostas lidas/ajustadas, nota, data e identificação do professor; evitar armazenar a foto por padrão.
- Definir uma fila local para guardar correções offline e sincronizar quando a rede voltar, incluindo prevenção de duplicidade pelo token e submissão.

### Depois — grade coerente com tipos

O formulário de tipos permite 2–8 alternativas, mas a grade do cabeçalho do aluno está fixa em A–E. Antes de usar um tipo com outro número de alternativas, alterar o snapshot do pacote para carregar `alternatives_count` por posição e desenhar as opções correspondentes. Definir se a leitura futura aceitará número variável de alternativas ou se a regra de produto será padronizar todas em cinco.

### Outras melhorias

- Permitir configurar nome do instituto/campus e talvez logomarca, em vez de deixar `Campus Januária` fixo no gerador.
- Revisar o layout A4 usando questões reais com enunciados longos, imagens e os limites máximos, verificando se a paginação mantém leitura confortável.
- Considerar embaralhamento aleatório de questões/alternativas com semente salva para auditoria, se o professor quiser aumentar a variação. A ordem precisa continuar alinhada ao gabarito congelado.
- Adicionar prévia antes de finalizar o pacote e edição de instruções sem reescrever snapshots já emitidos (por padrão, criar novo pacote para novas instruções).
- Criar esquema de submissões/resultados e uma política de retenção dos dados de alunos quando a correção for iniciada.
- Atualizar `README.md` quando novas etapas forem concluídas; parte do texto de planejamento pode ficar atrás do comportamento implementado.

## 9. Cuidados ao continuar

- Não colocar `DATABASE_URL`, segredos, token Blob ou informações do `.env.local` neste arquivo, logs, cliente React ou respostas de API.
- Manter verificação de `requireUser()` em ações e rotas privadas. O QR não é mecanismo de autorização.
- Não corrigir uma prova consultando a questão atual do banco; use sempre o snapshot salvo na versão.
- Conservar ordenação de alternativas e gabarito como um único contrato entre editor, PDF e correção.
- Preservar imagens de snapshots enquanto os pacotes dependerem delas no Blob.
- Verificar o schema real antes de aplicar uma migração novamente; o histórico de migrações é uma sequência de arquivos SQL, não existe comando npm que aplique tudo automaticamente.
- Alterações de layout de PDF devem ser renderizadas com `pdftoppm` e inspecionadas visualmente, incluindo primeira página, continuação, rodapé, versões com 1 e 10 questões e questões com imagens.
- `web/next.config.ts` usa `outputFileTracingIncludes` para a logomarca no endpoint PDF. Se mudar caminho ou rota, atualizar a inclusão e verificar o NFT gerado no build.

## 10. Estado de validação conhecido

- `npm run build` passou após a implementação do cabeçalho, instruções, rodapés e inclusão da logomarca no tracing.
- PDFs sintéticos de 4 e 10 questões foram renderizados e inspecionados; foram conferidos a primeira página, a continuação e o rodapé.
- A migração de instruções foi aplicada e consultada no Neon `production`.
- `npm run build` passou após a implementação do cartão OMR, do payload QR offline schema v1 e do reforço visual das colunas e textos.
- A migração `202611250006_exam_version_qr_tokens.sql` foi testada em branch Neon temporária e aplicada em `production`; os 22 registros existentes têm tokens não nulos e únicos.
- A diagramação do cartão foi renderizada e inspecionada com uma amostra de 10 questões em duas páginas; ainda não foi validada com fotos de celular nem com leitura automática.
- Ainda não há testes automatizados.
