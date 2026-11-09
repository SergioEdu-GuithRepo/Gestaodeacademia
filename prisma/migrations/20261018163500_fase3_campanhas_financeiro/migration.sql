-- =============================================================================
-- Fase 3: Retenção, Campanhas, Programa de Indicação e Gestão Financeira
-- =============================================================================

-- 1. Novos tipos enumerados
ALTER TYPE "TipoMensagem" ADD VALUE IF NOT EXISTS 'CAMPANHA';

CREATE TYPE "TipoCampanha" AS ENUM ('SAZONAL', 'FIDELIZACAO', 'SEGMENTADA');
CREATE TYPE "EstadoCampanha" AS ENUM ('RASCUNHO', 'ATIVA', 'ENVIADA', 'ENCERRADA');
CREATE TYPE "CategoriaDespesa" AS ENUM (
  'FORMADOR',
  'SALARIOS',
  'CONSUMIVEIS',
  'MANUTENCAO',
  'INSTALACOES',
  'MARKETING',
  'OUTROS'
);

-- 2. Regras de fidelização e indicação por centro
ALTER TABLE "ConfiguracaoCentro"
  ADD COLUMN "descontoFidelizacaoPct" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "pontosPorIndicacao" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "percentagemPorPonto" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "limiteDescontoIndicacaoPct" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "validadePontosMeses" INTEGER NOT NULL DEFAULT 12;

-- 3. Ligação de indicação no formando
ALTER TABLE "Formando"
  ADD COLUMN "indicadoPorId" TEXT;

CREATE INDEX "Formando_indicadoPorId_idx" ON "Formando"("indicadoPorId");

ALTER TABLE "Formando"
  ADD CONSTRAINT "Formando_indicadoPorId_fkey"
  FOREIGN KEY ("indicadoPorId") REFERENCES "Formando"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Tabela de Campanhas
CREATE TABLE "Campanha" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" "TipoCampanha" NOT NULL,
  "estado" "EstadoCampanha" NOT NULL DEFAULT 'RASCUNHO',
  "descontoPct" INTEGER NOT NULL DEFAULT 0,
  "mesValidade" INTEGER,
  "anoValidade" INTEGER,
  "orcamentoMax" BIGINT,
  "formacaoId" TEXT,
  "filtroNivelInteresse" TEXT,
  "filtroMinFormacoes" INTEGER,
  "filtroMaxFormacoes" INTEGER,
  "filtroProfissao" TEXT,
  "filtroIntencaoCompra" BOOLEAN,
  "mensagemTexto" TEXT NOT NULL,
  "totalDestinatarios" INTEGER NOT NULL DEFAULT 0,
  "enviadaEm" TIMESTAMP(3),
  "criadaPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Campanha_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Campanha_desconto_sazonal_check" CHECK (
    "descontoPct" >= 0 AND "descontoPct" <= 100 AND ("tipo" <> 'SAZONAL' OR "descontoPct" <= 20)
  )
);

CREATE INDEX "Campanha_tenantId_estado_createdAt_idx" ON "Campanha"("tenantId", "estado", "createdAt");
CREATE INDEX "Campanha_tenantId_mesValidade_anoValidade_idx" ON "Campanha"("tenantId", "mesValidade", "anoValidade");

ALTER TABLE "Campanha"
  ADD CONSTRAINT "Campanha_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Campanha"
  ADD CONSTRAINT "Campanha_formacaoId_fkey"
  FOREIGN KEY ("formacaoId") REFERENCES "Formacao"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Campos de campanha e resgate de pontos na Matrícula e na Mensagem
ALTER TABLE "Matricula"
  ADD COLUMN "campanhaId" TEXT,
  ADD COLUMN "pontosResgatados" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Matricula_campanhaId_idx" ON "Matricula"("campanhaId");

ALTER TABLE "Matricula"
  ADD CONSTRAINT "Matricula_campanhaId_fkey"
  FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Mensagem"
  ADD COLUMN "campanhaId" TEXT;

CREATE INDEX "Mensagem_campanhaId_idx" ON "Mensagem"("campanhaId");

ALTER TABLE "Mensagem"
  ADD CONSTRAINT "Mensagem_campanhaId_fkey"
  FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Tabela de Movimentos de Pontos de Indicação
CREATE TABLE "MovimentoPontos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "formandoId" TEXT NOT NULL,
  "pontos" INTEGER NOT NULL,
  "motivo" TEXT NOT NULL,
  "indicadoId" TEXT,
  "matriculaId" TEXT,
  "expiraEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MovimentoPontos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MovimentoPontos_tenantId_formandoId_indicadoId_key"
  ON "MovimentoPontos"("tenantId", "formandoId", "indicadoId");
CREATE INDEX "MovimentoPontos_tenantId_formandoId_createdAt_idx"
  ON "MovimentoPontos"("tenantId", "formandoId", "createdAt");

ALTER TABLE "MovimentoPontos"
  ADD CONSTRAINT "MovimentoPontos_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovimentoPontos"
  ADD CONSTRAINT "MovimentoPontos_formandoId_fkey"
  FOREIGN KEY ("formandoId") REFERENCES "Formando"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovimentoPontos"
  ADD CONSTRAINT "MovimentoPontos_indicadoId_fkey"
  FOREIGN KEY ("indicadoId") REFERENCES "Formando"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MovimentoPontos"
  ADD CONSTRAINT "MovimentoPontos_matriculaId_fkey"
  FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Tabela de Despesas Operacionais
CREATE TABLE "Despesa" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "categoria" "CategoriaDespesa" NOT NULL,
  "descricao" TEXT NOT NULL,
  "valor" BIGINT NOT NULL,
  "data" DATE NOT NULL,
  "fornecedor" TEXT,
  "metodo" "MetodoPagamento" NOT NULL DEFAULT 'TRANSFERENCIA',
  "referencia" TEXT,
  "formacaoId" TEXT,
  "turmaId" TEXT,
  "formadorId" TEXT,
  "horasPagas" DECIMAL(6, 2),
  "notas" TEXT,
  "registadoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Despesa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Despesa_valor_positivo_check" CHECK ("valor" > 0)
);

CREATE INDEX "Despesa_tenantId_data_idx" ON "Despesa"("tenantId", "data");
CREATE INDEX "Despesa_tenantId_categoria_idx" ON "Despesa"("tenantId", "categoria");
CREATE INDEX "Despesa_tenantId_formacaoId_idx" ON "Despesa"("tenantId", "formacaoId");
CREATE INDEX "Despesa_tenantId_formadorId_idx" ON "Despesa"("tenantId", "formadorId");

ALTER TABLE "Despesa"
  ADD CONSTRAINT "Despesa_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Despesa"
  ADD CONSTRAINT "Despesa_formacaoId_fkey"
  FOREIGN KEY ("formacaoId") REFERENCES "Formacao"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Despesa"
  ADD CONSTRAINT "Despesa_turmaId_fkey"
  FOREIGN KEY ("turmaId") REFERENCES "Turma"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Despesa"
  ADD CONSTRAINT "Despesa_formadorId_fkey"
  FOREIGN KEY ("formadorId") REFERENCES "Formador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Despesa"
  ADD CONSTRAINT "Despesa_registadoPorId_fkey"
  FOREIGN KEY ("registadoPorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Row-Level Security (RLS) e permissões nas novas tabelas multi-tenant
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "MovimentoPontos", "Campanha", "Despesa" TO academia_app;

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY['MovimentoPontos', 'Campanha', 'Despesa'];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_isolamento_tenant ON %I', t);
    EXECUTE format(
      'CREATE POLICY rls_isolamento_tenant ON %I FOR ALL TO PUBLIC USING (app_tenant_permitido("tenantId")) WITH CHECK (app_tenant_permitido("tenantId"))',
      t
    );
  END LOOP;
END
$$;
