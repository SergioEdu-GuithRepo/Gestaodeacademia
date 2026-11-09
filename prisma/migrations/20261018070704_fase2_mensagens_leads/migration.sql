-- CreateEnum
CREATE TYPE "ModoWhatsapp" AS ENUM ('DESATIVADO', 'SIMULACAO', 'EVOLUTION');

-- CreateEnum
CREATE TYPE "TipoMensagem" AS ENUM ('LEMBRETE_VENCIMENTO', 'PARCELA_ATRASO', 'CONFIRMACAO_PAGAMENTO', 'PLANO_CONCLUIDO', 'ANIVERSARIO', 'NOVO_LEAD', 'MANUAL', 'TESTE');

-- CreateEnum
CREATE TYPE "EstadoMensagem" AS ENUM ('PENDENTE', 'ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoLead" AS ENUM ('NOVO', 'CONTACTADO', 'CONVERTIDO', 'PERDIDO');

-- CreateTable
CREATE TABLE "ConfiguracaoCentro" (
    "tenantId" TEXT NOT NULL,
    "whatsappModo" "ModoWhatsapp" NOT NULL DEFAULT 'SIMULACAO',
    "evolutionUrl" TEXT,
    "evolutionApiKey" TEXT,
    "evolutionInstancia" TEXT,
    "webhookToken" TEXT NOT NULL,
    "intervaloEnvioSegundos" INTEGER NOT NULL DEFAULT 5,
    "lembretesAtivos" BOOLEAN NOT NULL DEFAULT true,
    "diasAntesVencimento" INTEGER NOT NULL DEFAULT 3,
    "diasAposAtraso" INTEGER[] DEFAULT ARRAY[1, 7]::INTEGER[],
    "confirmacoesAtivas" BOOLEAN NOT NULL DEFAULT true,
    "aniversariosAtivos" BOOLEAN NOT NULL DEFAULT true,
    "horaEnvio" INTEGER NOT NULL DEFAULT 9,
    "numerosEquipaComercial" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "apresentacaoPublica" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoCentro_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "ModeloMensagem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoMensagem" NOT NULL,
    "texto" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModeloMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoMensagem" NOT NULL,
    "destino" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "estado" "EstadoMensagem" NOT NULL DEFAULT 'PENDENTE',
    "chave" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativa" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erro" TEXT,
    "idExterno" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "lidaEm" TIMESTAMP(3),
    "formandoId" TEXT,
    "leadId" TEXT,
    "matriculaId" TEXT,
    "parcelaId" TEXT,
    "pagamentoId" TEXT,
    "criadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "profissao" TEXT,
    "formacaoId" TEXT NOT NULL,
    "turmaId" TEXT,
    "precoApresentado" BIGINT NOT NULL,
    "aceitouPreco" BOOLEAN NOT NULL,
    "aceitouDatas" BOOLEAN NOT NULL,
    "estado" "EstadoLead" NOT NULL DEFAULT 'NOVO',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "fbclid" TEXT,
    "referrer" TEXT,
    "ipHash" TEXT,
    "notas" TEXT,
    "formandoId" TEXT,
    "contactadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoCentro_webhookToken_key" ON "ConfiguracaoCentro"("webhookToken");

-- CreateIndex
CREATE UNIQUE INDEX "ModeloMensagem_tenantId_tipo_key" ON "ModeloMensagem"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "Mensagem_estado_proximaTentativa_idx" ON "Mensagem"("estado", "proximaTentativa");

-- CreateIndex
CREATE INDEX "Mensagem_tenantId_createdAt_idx" ON "Mensagem"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Mensagem_formandoId_idx" ON "Mensagem"("formandoId");

-- CreateIndex
CREATE INDEX "Mensagem_idExterno_idx" ON "Mensagem"("idExterno");

-- CreateIndex
CREATE UNIQUE INDEX "Mensagem_tenantId_chave_key" ON "Mensagem"("tenantId", "chave");

-- CreateIndex
CREATE INDEX "Lead_tenantId_estado_createdAt_idx" ON "Lead"("tenantId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_tenantId_whatsapp_idx" ON "Lead"("tenantId", "whatsapp");

-- CreateIndex
CREATE INDEX "Lead_ipHash_createdAt_idx" ON "Lead"("ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "ConfiguracaoCentro" ADD CONSTRAINT "ConfiguracaoCentro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeloMensagem" ADD CONSTRAINT "ModeloMensagem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_formandoId_fkey" FOREIGN KEY ("formandoId") REFERENCES "Formando"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_formacaoId_fkey" FOREIGN KEY ("formacaoId") REFERENCES "Formacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_formandoId_fkey" FOREIGN KEY ("formandoId") REFERENCES "Formando"("id") ON DELETE SET NULL ON UPDATE CASCADE;
