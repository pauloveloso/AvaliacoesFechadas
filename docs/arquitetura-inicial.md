# Sistema de avaliações fechadas — arquitetura inicial

## 1. Objetivo

Criar um sistema para cadastrar questões objetivas organizadas por categoria e posição na prova, montar pacotes de avaliações equivalentes, gerar PDFs prontos para impressão e permitir consultar gabaritos e corrigir respostas.

O PDF enviado é uma referência visual de uma prova real: papel A4, cabeçalho institucional, campos de identificação, enunciados com código e alternativas. Ele ajuda a orientar o editor e o diagramador, mas não define todas as regras do produto. A prova do exemplo também contém uma questão discursiva; o sistema inicial ficará restrito às fechadas com gabarito, conforme o pedido.

## 2. Decisões de produto

- Uma **categoria** organiza os bancos de questões por posição (até 10). Ao gerar uma avaliação, o professor escolhe quantas posições usar; cada posição mantém formato e quantidade de alternativas fixos.
- Cada posição (Questão 1, Questão 2 etc.) recebe um banco próprio de questões candidatas. Em uma categoria, cada posição configurada mantém o mesmo formato e o mesmo número de alternativas. O professor define quantas posições/questões a avaliação terá (no máximo 10) e informa o valor em pontos de cada questão; a soma define o valor total da prova e a nota do aluno.
- Questões candidatas associadas à mesma posição compartilham formato e número de alternativas; tema/conteúdo e dificuldade podem ser usados para organizar e equilibrar o banco.
- Um **pacote** é uma geração fechada e versionada, como 30 provas daquela categoria. Cada prova contém uma seleção e ordem imutáveis.
- Cada prova recebe identificador único e QR code. O QR identifica a versão da prova e permite abrir o gabarito após autorização; não deve carregar as respostas legíveis no próprio código.
- O gabarito fica guardado no servidor e vinculado exatamente à versão gerada, mesmo que questões sejam editadas depois.

## 3. Tecnologias recomendadas

### Aplicação

- **TypeScript** em todo o produto.
- **Next.js (React)** para a aplicação web: cadastro, edição, geração, consulta e correção. Começar como aplicação única evita separar serviços antes de haver necessidade.
- **PostgreSQL** como banco principal, com migrações versionadas.
- **Neon Auth** para login do professor e **`pg` com `@vercel/functions`** para consultas PostgreSQL no Vercel Fluid. A connection string fica somente no servidor; ações e consultas verificam a sessão antes de acessar dados. As mudanças do banco ficam em migrações SQL versionadas.
- As fotos de correção são processadas no navegador e descartadas sem upload. Se questões precisarem de imagens, podemos usar o armazenamento de objetos do Neon ou manter a mídia embutida nos blocos de conteúdo.
- **OpenCV.js** para leitura óptica (OMR) no navegador do celular; uma biblioteca JavaScript de QR para localizar a prova. O servidor recebe as respostas reconhecidas e os dados da correção, não precisa executar processamento de imagem.

### PDFs e QR

- **HTML/CSS de impressão** para diagramar; geração inicial pelo recurso de impressão do navegador (Salvar como PDF), sem serviço extra. Se for necessário baixar o PDF diretamente dentro da aplicação, avaliar `@react-pdf/renderer` no cliente após validar o layout.
- Biblioteca TypeScript de QR Code para gerar o código em cada prova.
- Guardar no QR apenas um identificador opaco e aleatório (ou URL curta com token opaco). A API valida o token, aplica autorização e registra acesso. Não incluir o gabarito no QR.

### Implantação inicial

- **Vercel Hobby** para publicar a aplicação Next.js e **Neon Free** para PostgreSQL e Neon Auth. O uso pressupõe que se enquadre nos termos de projeto pessoal/não comercial da Vercel. O banco pode escalar a zero após inatividade; o primeiro acesso pode aguardar a reativação.

## 4. Estrutura funcional

1. **Categorias** — nome, instruções, cabeçalho/rodapé, duração opcional, configuração de impressão e sequência de posições.
2. **Questões** — enunciado rico (texto, código, imagens), alternativas ordenadas, resposta correta, explicação opcional e metadados de tema, dificuldade e tags.
3. **Posições da prova** — por exemplo, posição 1 aceita questões do conjunto A e posição 2 aceita questões do conjunto B. A categoria define as regras de seleção para cada posição.
4. **Geração de pacote** — quantidade de provas, verificação de banco suficiente, seleção aleatória com restrições e revisão de prévia. A geração salva um snapshot imutável de enunciados, alternativas e gabarito. A mesma questão pode aparecer em várias provas do pacote; não há restrição de repetição entre provas.
5. **PDF** — prova individual ou arquivo combinado do pacote; QR individual por prova; campo de nome/turma e grade compacta de respostas no próprio caderno, logo após o cabeçalho. Como há no máximo 10 questões, a grade pode indicar as alternativas de cada questão sem uma folha separada. Incluir marcas de referência para alinhar a foto.
6. **Correção automática** — fotografar a região do cabeçalho e da grade pelo celular; processar a imagem no navegador com OpenCV.js, detectar e ler o QR, identificar as bolhas marcadas e comparar as respostas com o snapshot do gabarito; somar os valores das questões corretas e mostrar corretas, incorretas, não respondidas/ambíguas e nota.
7. **Revisão** — sinalizar marcações com baixa confiança, múltiplas marcações ou folha desalinhada para confirmação manual antes de fechar o resultado.
8. **Consulta** — página autenticada para mostrar questão, resposta correta e explicação, conforme as permissões definidas pelo professor.

## 5. Modelo de dados inicial

- `User`: usuário único mantido pelo Neon Auth.
- `Category`: categoria, configurações e status.
- `QuestionSlot`: categoria, número/posição, tipo e regras de seleção.
- `Question`: conteúdo-base, dificuldade, tema, versão e status.
- `Alternative`: questão, texto/figura e posição.
- `QuestionSlotItem`: associação entre uma posição e as questões candidatas.
- `Package`: categoria, quantidade, data, parâmetros e estado de geração.
- `ExamVersion`: pacote, código público opaco, QR, número da prova e versão do layout.
- `ExamQuestion`: questão congelada na prova, posição, alternativas na ordem impressa, resposta correta e valor em pontos congelados.
- `Student` (opcional no MVP): identificação do aluno.
- `Submission`: prova aplicada, aluno/turma, respostas e resultado da correção.

O snapshot em `ExamQuestion` é essencial: alterar o cadastro de uma questão não pode alterar provas já impressas.

## 6. Fluxos principais

### Preparar questões

Cadastrar categoria → configurar posições → cadastrar questões e alternativas → indicar a resposta correta → classificar tema/dificuldade → associar cada questão às posições permitidas.

### Gerar e imprimir

Solicitar, por exemplo, 30 provas → validar quantidade e critérios de equivalência → selecionar questões por posição (com repetição livre entre provas) → embaralhar alternativas se configurado → congelar snapshots → gerar prévia → exportar PDF.

A equivalência de dificuldade não pode ser garantida apenas por sorteio. O sistema deve permitir regras explícitas (por exemplo, mesma dificuldade e tema por posição) e mostrar avisos quando o banco cadastrado não tiver opções suficientes.

### Corrigir e consultar

Fotografar com o celular o cabeçalho e a grade de respostas impressa na própria prova → processar a imagem localmente no navegador → ler QR e marcações → revisar alertas de baixa confiança → comparar com o gabarito congelado no servidor → somar os pontos das questões corretas e calcular a nota → consultar gabarito e explicações.

## 7. Escopo recomendado para o MVP

- Um usuário administrador/professor.
- Categorias e posições fixas.
- Questões de múltipla escolha com uma resposta correta.
- Texto e blocos de código no enunciado; imagens podem entrar na primeira versão se forem necessárias para as questões reais.
- Geração aleatória controlada de provas e PDF combinado com QR individual.
- Consulta autenticada do gabarito.
- Leitura automática por foto de celular da grade de respostas impressa na própria prova, com QR individual e resultado por questão.
- Revisão manual dos casos ambíguos ou de baixa confiança.
- Exportação ou relatório simples de resultados.

A leitura óptica requer uma grade padronizada no próprio caderno, marcas de referência e foto nítida do cabeçalho e da grade. O QR identifica a versão da prova; as respostas vêm das bolhas preenchidas. O sistema deve apresentar uma tela de confirmação para marcações apagadas, múltiplas ou incertas. Cada `ExamQuestion` congela também o valor em pontos, e a soma dos valores compõe o total da prova.

## 8. Organização sugerida do código

```text
web/src/
  app/                   páginas, ações e rotas da aplicação
    api/auth/            proxy de autenticação Neon Auth
    auth/                páginas de login e saída
  components/            componentes de interface e editor
  features/
    categories/          cadastro e estrutura das categorias
    questions/           questões, alternativas e classificação
    packages/            regras e geração de pacotes
    exams/                provas, QR e exportação PDF
    correction/           respostas, correção e relatórios
  lib/
    auth/server.ts        Neon Auth e checagem de sessão
    db.ts                 consultas PostgreSQL somente no servidor
  proxy.ts                proteção inicial das rotas
neon/
  migrations/            migrações SQL versionadas
```

As rotas e ações do servidor devem checar a sessão antes de acessar o banco. A `DATABASE_URL` nunca deve ser exposta em componentes de cliente.

## 9. Cuidados de implementação

- Manter histórico/snapshot de cada prova gerada e não depender do cadastro atual da questão para corrigir.
- Usar tokens aleatórios não sequenciais no QR; aplicar autorização e possibilidade de revogação.
- Não expor gabaritos em rotas públicas nem no conteúdo do QR.
- Registrar a semente/parâmetros de geração para auditoria e reprodutibilidade, sem tornar o QR previsível.
- Garantir que a ordem das alternativas impressas corresponda à chave de resposta salva.
- Criar pré-visualização antes de exportar o pacote e validar paginação, quebras de código, imagens e legibilidade em A4.
- Evitar usar o PDF original como fundo fixo: os conteúdos variam e precisam fluir sem sobreposição; usar o arquivo como referência de estilo.

## 10. Próxima etapa

O esqueleto inicial já está ligado ao branch `production` do Neon, com Neon Auth, acesso ao PostgreSQL somente pelo servidor e a migração inicial de categorias/posições/questões aplicada. O próximo passo funcional é implementar o cadastro de categorias e posições. Depois virão o editor de questões e alternativas, geração de pacotes com snapshots e valores por questão, PDF com QR e grade de respostas e, por fim, leitura óptica pelo navegador do celular. O layout da grade será calibrado com fotos reais antes de confiar a correção automaticamente.
