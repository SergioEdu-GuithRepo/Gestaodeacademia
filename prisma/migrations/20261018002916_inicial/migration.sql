-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'COMERCIAL', 'PEDAGOGICO', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "CategoriaFormacao" AS ENUM ('COMPORTAMENTAL', 'TECNICA');

-- CreateEnum
CREATE TYPE "EstadoTurma" AS ENUM ('PLANEADA', 'EM_CURSO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoSessao" AS ENUM ('AGENDADA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoMatricula" AS ENUM ('ATIVA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('MULTICAIXA', 'REFERENCIA', 'TRANSFERENCIA', 'NUMERARIO', 'TPA', 'OUTRO');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('PRONTO', 'PARCELADO');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "acao" TEXT NOT NULL,
    "dados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "areaId" TEXT,

    CONSTRAINT "Competencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "precoHoraComportamental" BIGINT,
    "precoHoraTecnica" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoFormadorFormacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formadorId" TEXT NOT NULL,
    "formacaoId" TEXT NOT NULL,
    "precoHora" BIGINT NOT NULL,

    CONSTRAINT "PrecoFormadorFormacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaliacaoFormador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formadorId" TEXT NOT NULL,
    "turmaId" TEXT,
    "dominioConteudo" INTEGER NOT NULL,
    "eticaProfissional" INTEGER NOT NULL,
    "cumprimentoHorarios" INTEGER NOT NULL,
    "enquadramentoExercicios" INTEGER NOT NULL,
    "capacidadeMotivar" INTEGER NOT NULL,
    "comentario" TEXT,
    "avaliadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvaliacaoFormador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "cargaHoraria" INTEGER NOT NULL,
    "preco" BIGINT NOT NULL,
    "categoria" "CategoriaFormacao" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sala" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "capacidade" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Sala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turma" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formacaoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "vagas" INTEGER,
    "preco" BIGINT,
    "estado" "EstadoTurma" NOT NULL DEFAULT 'PLANEADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "formadorId" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "estado" "EstadoSessao" NOT NULL DEFAULT 'AGENDADA',
    "horasLecionadas" DECIMAL(5,2),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formando" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "profissao" TEXT,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "dataNascimento" DATE,
    "intencaoCompra" BOOLEAN NOT NULL DEFAULT false,
    "formaPagamentoPreferida" "FormaPagamento",
    "avaliacaoEquipa" INTEGER,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formando_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matricula" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formandoId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "valorTotal" BIGINT NOT NULL,
    "desconto" BIGINT NOT NULL DEFAULT 0,
    "numParcelas" INTEGER NOT NULL,
    "estado" "EstadoMatricula" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matricula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcela" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matriculaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" BIGINT NOT NULL,
    "vencimento" DATE NOT NULL,

    CONSTRAINT "Parcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formandoId" TEXT NOT NULL,
    "matriculaId" TEXT NOT NULL,
    "valor" BIGINT NOT NULL,
    "metodo" "MetodoPagamento" NOT NULL,
    "dataPagamento" DATE NOT NULL,
    "referencia" TEXT,
    "referenciaRecibo" TEXT,
    "notas" TEXT,
    "registadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlocacaoPagamento" (
    "id" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "parcelaId" TEXT NOT NULL,
    "valor" BIGINT NOT NULL,

    CONSTRAINT "AlocacaoPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AreaToFormador" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AreaToFormador_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CompetenciaToFormador" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CompetenciaToFormador_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entidade_entidadeId_idx" ON "AuditLog"("tenantId", "entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Area_tenantId_nome_key" ON "Area"("tenantId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Competencia_tenantId_nome_key" ON "Competencia"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "Formador_tenantId_nome_idx" ON "Formador"("tenantId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "PrecoFormadorFormacao_formadorId_formacaoId_key" ON "PrecoFormadorFormacao"("formadorId", "formacaoId");

-- CreateIndex
CREATE INDEX "AvaliacaoFormador_formadorId_idx" ON "AvaliacaoFormador"("formadorId");

-- CreateIndex
CREATE UNIQUE INDEX "Formacao_tenantId_slug_key" ON "Formacao"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Sala_tenantId_nome_key" ON "Sala"("tenantId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Turma_tenantId_codigo_key" ON "Turma"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "Sessao_tenantId_inicio_idx" ON "Sessao"("tenantId", "inicio");

-- CreateIndex
CREATE INDEX "Sessao_turmaId_idx" ON "Sessao"("turmaId");

-- CreateIndex
CREATE INDEX "Sessao_formadorId_idx" ON "Sessao"("formadorId");

-- CreateIndex
CREATE INDEX "Sessao_salaId_idx" ON "Sessao"("salaId");

-- CreateIndex
CREATE INDEX "Formando_tenantId_nome_idx" ON "Formando"("tenantId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Formando_tenantId_whatsapp_key" ON "Formando"("tenantId", "whatsapp");

-- CreateIndex
CREATE INDEX "Matricula_tenantId_idx" ON "Matricula"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Matricula_formandoId_turmaId_key" ON "Matricula"("formandoId", "turmaId");

-- CreateIndex
CREATE INDEX "Parcela_tenantId_vencimento_idx" ON "Parcela"("tenantId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "Parcela_matriculaId_numero_key" ON "Parcela"("matriculaId", "numero");

-- CreateIndex
CREATE INDEX "Pagamento_tenantId_dataPagamento_idx" ON "Pagamento"("tenantId", "dataPagamento");

-- CreateIndex
CREATE INDEX "Pagamento_formandoId_idx" ON "Pagamento"("formandoId");

-- CreateIndex
CREATE INDEX "AlocacaoPagamento_parcelaId_idx" ON "AlocacaoPagamento"("parcelaId");

-- CreateIndex
CREATE INDEX "_AreaToFormador_B_index" ON "_AreaToFormador"("B");

-- CreateIndex
CREATE INDEX "_CompetenciaToFormador_B_index" ON "_CompetenciaToFormador"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competencia" ADD CONSTRAINT "Competencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competencia" ADD CONSTRAINT "Competencia_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formador" ADD CONSTRAINT "Formador_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoFormadorFormacao" ADD CONSTRAINT "PrecoFormadorFormacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoFormadorFormacao" ADD CONSTRAINT "PrecoFormadorFormacao_formadorId_fkey" FOREIGN KEY ("formadorId") REFERENCES "Formador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoFormadorFormacao" ADD CONSTRAINT "PrecoFormadorFormacao_formacaoId_fkey" FOREIGN KEY ("formacaoId") REFERENCES "Formacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoFormador" ADD CONSTRAINT "AvaliacaoFormador_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoFormador" ADD CONSTRAINT "AvaliacaoFormador_formadorId_fkey" FOREIGN KEY ("formadorId") REFERENCES "Formador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoFormador" ADD CONSTRAINT "AvaliacaoFormador_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formacao" ADD CONSTRAINT "Formacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sala" ADD CONSTRAINT "Sala_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_formacaoId_fkey" FOREIGN KEY ("formacaoId") REFERENCES "Formacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_formadorId_fkey" FOREIGN KEY ("formadorId") REFERENCES "Formador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "Sala"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formando" ADD CONSTRAINT "Formando_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_formandoId_fkey" FOREIGN KEY ("formandoId") REFERENCES "Formando"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcela" ADD CONSTRAINT "Parcela_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_formandoId_fkey" FOREIGN KEY ("formandoId") REFERENCES "Formando"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_matriculaId_fkey" FOREIGN KEY ("matriculaId") REFERENCES "Matricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_registadoPorId_fkey" FOREIGN KEY ("registadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlocacaoPagamento" ADD CONSTRAINT "AlocacaoPagamento_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlocacaoPagamento" ADD CONSTRAINT "AlocacaoPagamento_parcelaId_fkey" FOREIGN KEY ("parcelaId") REFERENCES "Parcela"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaToFormador" ADD CONSTRAINT "_AreaToFormador_A_fkey" FOREIGN KEY ("A") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AreaToFormador" ADD CONSTRAINT "_AreaToFormador_B_fkey" FOREIGN KEY ("B") REFERENCES "Formador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetenciaToFormador" ADD CONSTRAINT "_CompetenciaToFormador_A_fkey" FOREIGN KEY ("A") REFERENCES "Competencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompetenciaToFormador" ADD CONSTRAINT "_CompetenciaToFormador_B_fkey" FOREIGN KEY ("B") REFERENCES "Formador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Regra crítica 4.5: conflitos de agenda garantidos pela base de dados.
-- Intervalos semi-abertos [inicio, fim): sessões encostadas não colidem.
-- Sessões CANCELADAS não ocupam turma, formador nem sala.
-- (Mantido manualmente — o Prisma não modela exclusion constraints.)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Sessao"
  ADD CONSTRAINT "sessao_fim_depois_inicio" CHECK ("fim" > "inicio");

ALTER TABLE "Sessao"
  ADD CONSTRAINT "sessao_turma_sem_conflito"
  EXCLUDE USING gist ("tenantId" WITH =, "turmaId" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
  WHERE ("estado" <> 'CANCELADA');

ALTER TABLE "Sessao"
  ADD CONSTRAINT "sessao_formador_sem_conflito"
  EXCLUDE USING gist ("tenantId" WITH =, "formadorId" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
  WHERE ("estado" <> 'CANCELADA');

ALTER TABLE "Sessao"
  ADD CONSTRAINT "sessao_sala_sem_conflito"
  EXCLUDE USING gist ("tenantId" WITH =, "salaId" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
  WHERE ("estado" <> 'CANCELADA');

-- Integridade de dinheiro e avaliações
ALTER TABLE "Parcela" ADD CONSTRAINT "parcela_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "Pagamento" ADD CONSTRAINT "pagamento_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "AlocacaoPagamento" ADD CONSTRAINT "alocacao_valor_positivo" CHECK ("valor" > 0);
ALTER TABLE "AvaliacaoFormador" ADD CONSTRAINT "avaliacao_escala_1_5" CHECK (
  "dominioConteudo" BETWEEN 1 AND 5 AND "eticaProfissional" BETWEEN 1 AND 5 AND
  "cumprimentoHorarios" BETWEEN 1 AND 5 AND "enquadramentoExercicios" BETWEEN 1 AND 5 AND
  "capacidadeMotivar" BETWEEN 1 AND 5
);
