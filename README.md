# Gestão de Formação

Plataforma de gestão para centros de formação e academias de desenvolvimento humano (multi-tenant).
Stack: **Next.js 15 (App Router) · TypeScript · PostgreSQL + Prisma · Tailwind CSS**.

## Arranque rápido (desenvolvimento)

Requisitos: Node 20+, Docker.

```bash
cp .env.example .env          # ajustar se necessário
npm install
npm run db:up                 # PostgreSQL local em localhost:5435
npx prisma migrate deploy     # cria tabelas + exclusion constraints de agenda
npm run db:seed               # dados de demonstração
npm run dev                   # http://localhost:3000
npm run worker                # (outro terminal) fila de WhatsApp + lembretes
```

Contas de demonstração (palavra-passe `academia123`):

| Email | Perfil |
|---|---|
| admin@demo.ao | Administrador |
| comercial@demo.ao | Comercial |
| pedagogico@demo.ao | Coordenação pedagógica |
| financeiro@demo.ao | Financeiro |
| admin@outro.ao | Administrador de outro centro (para verificar isolamento) |

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e arranque de produção |
| `npm run worker` | Worker de mensagens WhatsApp (fila, lembretes, atrasos, aniversários) |
| `npm test` | Testes unitários e de integração (requer a BD local) |
| `npm run typecheck` / `npm run lint` | Verificações estáticas |
| `npm run db:migrate` | Nova migração (desenvolvimento) |
| `npm run db:deploy` | Aplicar migrações (produção) |
| `npm run db:seed` | Recriar dados de demonstração |

## Arquitetura

```
prisma/
  schema.prisma          modelo de dados
  migrations/            inclui SQL manual das exclusion constraints (conflitos de agenda)
  seed.ts                dados de demonstração
src/
  app/(app)/             backoffice autenticado (painel, agenda, turmas, formandos, formações, formadores, salas, matrículas)
  app/api/pesquisa/      pesquisa rápida de formandos
  app/api/webhooks/      webhook da Evolution API (estado de entrega)
  app/p/                 landing pages públicas + pré-cadastro (leads)
  app/login/             autenticação
  lib/
    db.ts                cliente Prisma + dbTenant() (isolamento por centro + auditoria)
    auth.ts              sessões em BD, exigir(permissão)
    rbac.ts              matriz de permissões por perfil
    agenda.ts            validação de conflitos (turma, formador, sala)
    parcelas.ts          geração de parcelas, alocação de pagamentos, estados
    money.ts / datas.ts  AOA em cêntimos (bigint) · fuso Africa/Luanda
    mensagens/           outbox WhatsApp: modelos, enfileirar, eventos, agendador, envio, webhook
    whatsapp/            cliente Evolution API
    segredos.ts          cifra AES-256-GCM de credenciais (APP_SECRET)
worker/                  processo de envio (npm run worker)
  components/            UI base, shell, pesquisa rápida
tests/                   vitest (unitários + integração com PostgreSQL)
```

### Decisões principais

- **Multi-tenant**: BD partilhada com `tenantId` em todas as tabelas. Todo o acesso de negócio passa por `dbTenant()`, que injeta o `tenantId` da sessão em leituras e escritas (testado em `tests/integracao.test.ts`).
- **Conflitos de agenda**: validação em duas camadas — verificação prévia com mensagens claras (`lib/agenda.ts`) e *exclusion constraints* PostgreSQL (`btree_gist`) que impedem sobreposições mesmo com gravações simultâneas. Sessões encostadas (10:00–12:00 / 12:00–14:00) são permitidas; canceladas não ocupam recursos.
- **Dinheiro**: kwanzas guardados em cêntimos (`BigInt`); pagamentos alocados às parcelas (mais antiga primeiro), permitindo pagamentos parciais.
- **Auditoria**: todas as escritas feitas via `dbTenant()` ficam registadas em `AuditLog` (sem dados sensíveis).
- **Mensagens WhatsApp (outbox)**: cada mensagem é gravada na tabela `Mensagem` dentro da mesma transação do evento (ex.: pagamento) e enviada pelo worker. Chaves únicas impedem duplicados (o agendador pode correr várias vezes por dia). Falhas transitórias são repetidas (1 min, 5 min, 30 min, 2 h); falhas definitivas ficam como **FALHADA** com o erro, visíveis em *Mensagens* e com alerta no painel — nada falha em silêncio. Modo **Simulação** para testar sem enviar.
- **Recibos AGT**: nesta fase os pagamentos são registo interno, com campo para a referência do recibo emitido no software certificado.

## Deploy na Railway

1. Criar um serviço PostgreSQL e um serviço **web** a partir deste repositório.
2. Variáveis (web e worker): `DATABASE_URL` (referência ao Postgres da Railway), `APP_TIMEZONE=Africa/Luanda`,
   `APP_SECRET` (segredo longo e aleatório — cifra a chave da Evolution API; **não mudar depois**),
   `APP_URL` (ex.: `https://gestao.exemplo.ao`, usado nos links das mensagens e no URL do webhook).
3. Web — Build: `npm run build` · Pre-deploy: `npx prisma migrate deploy` · Start: `npm start`.
4. Criar um segundo serviço **worker** a partir do mesmo repositório — Build: `npm run build` · Start: `npm run worker` (uma instância).
5. Em *Configurações → WhatsApp* (perfil Administrador): URL da Evolution API (pode ser o URL interno da Railway, ex.: `http://evolution-api.railway.internal:8080`), API key, instância; testar ligação; configurar na Evolution o webhook indicado (eventos `MESSAGES_UPDATE` e `SEND_MESSAGE`).
6. Ativar backups do PostgreSQL.
