-- =============================================================================
-- Fase 4: Tokens de acesso para o Portal do Formador e o Portal do Formando
-- =============================================================================

ALTER TABLE "Formador" ADD COLUMN "portalToken" TEXT;
UPDATE "Formador"
SET "portalToken" = 'pfor_' || md5("id" || random()::text || clock_timestamp()::text)
WHERE "portalToken" IS NULL;
ALTER TABLE "Formador" ALTER COLUMN "portalToken" SET NOT NULL;
CREATE UNIQUE INDEX "Formador_portalToken_key" ON "Formador"("portalToken");

ALTER TABLE "Formando" ADD COLUMN "portalToken" TEXT;
UPDATE "Formando"
SET "portalToken" = 'pfrm_' || md5("id" || random()::text || clock_timestamp()::text)
WHERE "portalToken" IS NULL;
ALTER TABLE "Formando" ALTER COLUMN "portalToken" SET NOT NULL;
CREATE UNIQUE INDEX "Formando_portalToken_key" ON "Formando"("portalToken");
