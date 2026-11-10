-- =============================================================================
-- Fase 5: Presenças Nominais, Certificados QR, Avisos de Pagamento, CRM e IA
-- =============================================================================

-- 1. Novos tipos enumerados e extensão de TipoMensagem
ALTER TYPE "TipoMensagem" ADD VALUE IF NOT EXISTS 'RELATORIO_IA';
ALTER TYPE "TipoMensagem" ADD VALUE IF NOT EXISTS 'ALERTA_IA';

CREATE TYPE "EstadoPresenca" AS ENUM ('PRESENTE', 'FALTA', 'JUSTIFICADA');
CREATE TYPE "EstadoAvisoPagamento" AS ENUM ('PENDENTE', 'CONFIRMADO', 'REJEITADO');
CREATE TYPE "TipoInteracaoLead" AS ENUM ('CHAMADA', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'NOTA');
CREATE TYPE "TipoRelatorioIA" AS ENUM (
  'SEMANAL_COMERCIAL',
  'MENSAL_FINANCEIRO',
  'POR_FORMACAO',
  'POR_FORMADOR',
  'ALERTA_IMEDIATO'
);
CREATE TYPE "CanalEntregaRelatorio" AS ENUM ('APENAS_SISTEMA', 'WHATSAPP', 'EMAIL', 'AMBOS');

-- 2. Deduplicação anónima de avaliações de formadores feitas pelos formandos no Portal
ALTER TABLE "AvaliacaoFormador"
  ADD COLUMN "chaveAnonima" TEXT;

CREATE UNIQUE INDEX "AvaliacaoFormador_tenantId_chaveAnonima_key"
  ON "AvaliacaoFormador"("tenantId", "chaveAnonima");

-- 3. Configurações de Dados Bancários, Certificados e Inteligência Artificial por Centro
ALTER TABLE "ConfiguracaoCentro"
  ADD COLUMN "bancoNome" TEXT,
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "titularConta" TEXT,
  ADD COLUMN "multicaixaExpress" TEXT,
  ADD COLUMN "minAssiduidadeCertificadoPct" INTEGER NOT NULL DEFAULT 75,
  ADD COLUMN "iaAtiva" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "anthropicApiKey" TEXT,
  ADD COLUMN "modeloClaude" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  ADD COLUMN "relatorioSemanalAtivo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "diaSemanaRelatorio" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "relatorioMensalAtivo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "diaMesRelatorio" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "horaRelatorio" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "alertasImediatosAtivos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "limiarInadimplenciaPct" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "canalRelatorio" "CanalEntregaRelatorio" NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN "destinatariosWhatsappRelatorio" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "destinatariosEmailRelatorio" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "resendApiKey" TEXT,
  ADD COLUMN "emailRemetente" TEXT;

ALTER TABLE "ConfiguracaoCentro"
  ALTER COLUMN "destinatariosWhatsappRelatorio" SET NOT NULL,
  ALTER COLUMN "destinatariosEmailRelatorio" SET NOT NULL;

-- 4. Tabela Presenca (chamada nominal por sessão)
CREATE TABLE "Presenca" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sessaoId" TEXT NOT NULL,
  "matriculaId" TEXT NOT NULL,
  "estado" "EstadoPresenca" NOT NULL DEFAULT 'PRESENTE',
  "observacao" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Presenca_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Presenca_sessaoId_matriculaId_key" ON "Presenca"("sessaoId", "matriculaId");
CREATE INDEX "Presenca_tenantId_matriculaId_idx" ON "Presenca"("tenantId", "matriculaId");

ALTER TABLE "Presenca"
  ADD CONSTRAINT "Presenca_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Presenca"
  ADD CONSTRAINT "Presenca_sessaoId_fkey"
  FOREIGN KEY ("sessaoId") REFERENCES "Sessao"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Presenca"
  ADD CONSTRAINT "Presenca_matriculaId_fkey"
  FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Tabela Certificado (diploma verificável por QR Code)
CREATE TABLE "Certificado" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "matriculaId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "cargaHoraria" INTEGER NOT NULL,
  "assiduidadePct" INTEGER NOT NULL,
  "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "emitidoPorId" TEXT,
  "revogadoEm" TIMESTAMP(3),
  "motivoRevogacao" TEXT,

  CONSTRAINT "Certificado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Certificado_matriculaId_key" ON "Certificado"("matriculaId");
CREATE UNIQUE INDEX "Certificado_codigo_key" ON "Certificado"("codigo");
CREATE INDEX "Certificado_tenantId_emitidoEm_idx" ON "Certificado"("tenantId", "emitidoEm");

ALTER TABLE "Certificado"
  ADD CONSTRAINT "Certificado_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certificado"
  ADD CONSTRAINT "Certificado_matriculaId_fkey"
  FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Certificado"
  ADD CONSTRAINT "Certificado_emitidoPorId_fkey"
  FOREIGN KEY ("emitidoPorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Tabela AvisoPagamento (comunicação de transferência/Express pelo formando no Portal)
CREATE TABLE "AvisoPagamento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "formandoId" TEXT NOT NULL,
  "matriculaId" TEXT NOT NULL,
  "parcelaId" TEXT,
  "valor" BIGINT NOT NULL,
  "metodo" "MetodoPagamento" NOT NULL DEFAULT 'TRANSFERENCIA',
  "referencia" TEXT NOT NULL,
  "dataTransferencia" DATE NOT NULL,
  "notas" TEXT,
  "estado" "EstadoAvisoPagamento" NOT NULL DEFAULT 'PENDENTE',
  "pagamentoGeradoId" TEXT,
  "analisadoPorId" TEXT,
  "analisadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AvisoPagamento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AvisoPagamento_valor_positivo_check" CHECK ("valor" > 0)
);

CREATE INDEX "AvisoPagamento_tenantId_estado_createdAt_idx" ON "AvisoPagamento"("tenantId", "estado", "createdAt");
CREATE INDEX "AvisoPagamento_matriculaId_idx" ON "AvisoPagamento"("matriculaId");

ALTER TABLE "AvisoPagamento"
  ADD CONSTRAINT "AvisoPagamento_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvisoPagamento"
  ADD CONSTRAINT "AvisoPagamento_formandoId_fkey"
  FOREIGN KEY ("formandoId") REFERENCES "Formando"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvisoPagamento"
  ADD CONSTRAINT "AvisoPagamento_matriculaId_fkey"
  FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvisoPagamento"
  ADD CONSTRAINT "AvisoPagamento_parcelaId_fkey"
  FOREIGN KEY ("parcelaId") REFERENCES "Parcela"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AvisoPagamento"
  ADD CONSTRAINT "AvisoPagamento_pagamentoGeradoId_fkey"
  FOREIGN KEY ("pagamentoGeradoId") REFERENCES "Pagamento"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AvisoPagamento"
  ADD CONSTRAINT "AvisoPagamento_analisadoPorId_fkey"
  FOREIGN KEY ("analisadoPorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Tabela InteracaoLead (histórico CRM e agendamento de follow-up)
CREATE TABLE "InteracaoLead" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "userId" TEXT,
  "tipo" "TipoInteracaoLead" NOT NULL DEFAULT 'WHATSAPP',
  "resumo" TEXT NOT NULL,
  "proximoFollowUp" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InteracaoLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InteracaoLead_tenantId_proximoFollowUp_idx" ON "InteracaoLead"("tenantId", "proximoFollowUp");
CREATE INDEX "InteracaoLead_leadId_createdAt_idx" ON "InteracaoLead"("leadId", "createdAt");

ALTER TABLE "InteracaoLead"
  ADD CONSTRAINT "InteracaoLead_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InteracaoLead"
  ADD CONSTRAINT "InteracaoLead_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InteracaoLead"
  ADD CONSTRAINT "InteracaoLead_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Tabela RelatorioIA (histórico comparável de relatórios gerados por IA com snapshot SQL)
CREATE TABLE "RelatorioIA" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tipo" "TipoRelatorioIA" NOT NULL,
  "titulo" TEXT NOT NULL,
  "periodoInicio" TIMESTAMP(3) NOT NULL,
  "periodoFim" TIMESTAMP(3) NOT NULL,
  "periodoAnteriorInicio" TIMESTAMP(3),
  "periodoAnteriorFim" TIMESTAMP(3),
  "formacaoId" TEXT,
  "formadorId" TEXT,
  "chaveIdempotencia" TEXT,
  "metricasSql" JSONB NOT NULL,
  "resumoExecutivo" TEXT NOT NULL,
  "variacoesPeriodo" TEXT NOT NULL,
  "pontosAtencao" TEXT NOT NULL,
  "acoesRecomendadas" TEXT NOT NULL,
  "mensagemCurtaWhatsapp" TEXT NOT NULL,
  "corpoEmailHtml" TEXT NOT NULL,
  "modeloUtilizado" TEXT NOT NULL,
  "canalSolicitado" "CanalEntregaRelatorio" NOT NULL,
  "entregueWhatsapp" BOOLEAN NOT NULL DEFAULT false,
  "entregueEmail" BOOLEAN NOT NULL DEFAULT false,
  "erroEntrega" TEXT,
  "geradoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RelatorioIA_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RelatorioIA_tenantId_chaveIdempotencia_key"
  ON "RelatorioIA"("tenantId", "chaveIdempotencia");
CREATE INDEX "RelatorioIA_tenantId_tipo_createdAt_idx"
  ON "RelatorioIA"("tenantId", "tipo", "createdAt");
CREATE INDEX "RelatorioIA_tenantId_createdAt_idx"
  ON "RelatorioIA"("tenantId", "createdAt");

ALTER TABLE "RelatorioIA"
  ADD CONSTRAINT "RelatorioIA_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RelatorioIA"
  ADD CONSTRAINT "RelatorioIA_formacaoId_fkey"
  FOREIGN KEY ("formacaoId") REFERENCES "Formacao"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RelatorioIA"
  ADD CONSTRAINT "RelatorioIA_formadorId_fkey"
  FOREIGN KEY ("formadorId") REFERENCES "Formador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RelatorioIA"
  ADD CONSTRAINT "RelatorioIA_geradoPorId_fkey"
  FOREIGN KEY ("geradoPorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 9. Row-Level Security (RLS) e permissões nas novas tabelas multi-tenant
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "Presenca",
  "Certificado",
  "AvisoPagamento",
  "InteracaoLead",
  "RelatorioIA"
TO academia_app;

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'Presenca',
    'Certificado',
    'AvisoPagamento',
    'InteracaoLead',
    'RelatorioIA'
  ];
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
