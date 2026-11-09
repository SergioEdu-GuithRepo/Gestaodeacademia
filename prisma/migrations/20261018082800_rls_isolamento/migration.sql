-- =============================================================================
-- Defesa em profundidade: Row-Level Security (RLS) no PostgreSQL
-- =============================================================================
-- Garante ao nível do motor da base de dados que uma transação associada a um
-- centro (GUC `app.tenant_id`) nunca consegue ler, inserir, alterar ou apagar
-- registos de outro centro, mesmo em consultas SQL diretas ($queryRaw) ou se
-- um filtro aplicacional for omitido por erro.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'academia_app') THEN
    CREATE ROLE academia_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT academia_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO academia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO academia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO academia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO academia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO academia_app;

-- Função de verificação do centro ativo na transação:
-- • Se `app.tenant_id` estiver definido, exige igualdade estrita com a linha.
-- • Se `app.rls_estrito = 'on'` sem `app.tenant_id`, bloqueia tudo.
-- • Caso contrário (migrações, seed, worker/autenticação de plataforma), permite.
CREATE OR REPLACE FUNCTION app_tenant_permitido(linha_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN nullif(current_setting('app.tenant_id', true), '') IS NOT NULL
      THEN linha_tenant_id = current_setting('app.tenant_id', true)
    WHEN current_setting('app.rls_estrito', true) = 'on'
      THEN false
    ELSE true
  END;
$$;

-- Ativar e forçar RLS em todas as tabelas com `tenantId`
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'User',
    'AuditLog',
    'Area',
    'Competencia',
    'Formador',
    'PrecoFormadorFormacao',
    'AvaliacaoFormador',
    'Formacao',
    'Sala',
    'Turma',
    'Sessao',
    'Formando',
    'Matricula',
    'Parcela',
    'Pagamento',
    'ConfiguracaoCentro',
    'ModeloMensagem',
    'Mensagem',
    'Lead'
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

-- Também na tabela Tenant (quando app.tenant_id está ativo, só vê o próprio centro)
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_isolamento_tenant ON "Tenant";
CREATE POLICY rls_isolamento_tenant ON "Tenant"
  FOR ALL TO PUBLIC
  USING (app_tenant_permitido("id"))
  WITH CHECK (app_tenant_permitido("id"));
