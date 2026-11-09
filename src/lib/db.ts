import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Acesso à base de dados.
 *
 * - `prisma`: cliente base, SEM isolamento. Usar apenas em autenticação,
 *   seeds e tarefas de plataforma.
 * - `dbTenant(ctx)`: cliente com isolamento por centro. Injeta `tenantId` em
 *   todas as leituras/escritas dos modelos de negócio e regista auditoria.
 *   Nota: em `create` aninhados (ex.: parcelas dentro de matrícula) o
 *   `tenantId` dos filhos tem de ser indicado explicitamente.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "test" ? [] : process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const MODELOS_TENANT = new Set<string>([
  "User",
  "AuditLog",
  "Area",
  "Competencia",
  "Formador",
  "PrecoFormadorFormacao",
  "AvaliacaoFormador",
  "Formacao",
  "Sala",
  "Turma",
  "Sessao",
  "Formando",
  "Matricula",
  "Parcela",
  "Pagamento",
  // Fase 2
  "ConfiguracaoCentro",
  "ModeloMensagem",
  "Mensagem",
  "Lead",
  // Fase 3
  "MovimentoPontos",
  "Campanha",
  "Despesa",
]);

/** Modelos com escrita frequente e sem valor de auditoria. */
const SEM_AUDITORIA = new Set<string>(["AuditLog", "Mensagem"]);

const OPERACOES_FILTRO = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

const OPERACOES_ESCRITA = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

const CAMPOS_SENSIVEIS = new Set(["passwordHash", "tokenHash", "evolutionApiKey", "webhookToken", "portalToken"]);

/** Converte valores para JSON seguro (bigint/Decimal → string, remove segredos). */
function paraJson(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(valor, (chave, v) => {
      if (CAMPOS_SENSIVEIS.has(chave)) return "[omitido]";
      if (typeof v === "bigint") return v.toString();
      return v;
    }),
  );
}

export type ContextoTenant = { tenantId: string; userId?: string | null };

/**
 * Ativa o Row-Level Security (RLS) do PostgreSQL na transação atual:
 * muda o role local para `academia_app` (NOSUPERUSER NOBYPASSRLS) e fixa
 * `app.tenant_id` até ao fim da transação (`SET LOCAL` / `is_local = true`).
 */
export async function ativarRlsTransacao(
  tx: Pick<Prisma.TransactionClient, "$executeRaw">,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SET LOCAL ROLE academia_app`;
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.rls_estrito', 'on', true)`;
}

/**
 * Executa uma função numa transação com Row-Level Security (RLS) ativo ao nível
 * do PostgreSQL. Qualquer leitura ou escrita (incluindo SQL direto) noutra
 * entidade de outro centro é bloqueada pelo motor da base de dados.
 */
export function comRls<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!tenantId) throw new Error("tenantId em falta");
  return prisma.$transaction(async (tx) => {
    await ativarRlsTransacao(tx, tenantId);
    return fn(tx);
  });
}

function criarClienteTenant(ctx: ContextoTenant) {
  const { tenantId, userId = null } = ctx;
  if (!tenantId) throw new Error("tenantId em falta");

  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!MODELOS_TENANT.has(model)) return query(args);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a: any = args ?? {};
          if (OPERACOES_FILTRO.has(operation)) {
            a.where = { ...(a.where ?? {}), tenantId };
          } else if (operation === "create") {
            a.data = { ...(a.data ?? {}), tenantId };
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            a.data = Array.isArray(a.data)
              ? a.data.map((d: object) => ({ ...d, tenantId }))
              : { ...a.data, tenantId };
          } else if (operation === "upsert") {
            a.where = { ...(a.where ?? {}), tenantId };
            a.create = { ...(a.create ?? {}), tenantId };
          }

          const resultado = await query(a);

          if (!SEM_AUDITORIA.has(model) && OPERACOES_ESCRITA.has(operation)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r: any = resultado;
            await prisma.auditLog
              .create({
                data: {
                  tenantId,
                  userId,
                  entidade: model,
                  entidadeId: typeof r?.id === "string" ? r.id : null,
                  acao: operation,
                  dados: paraJson(
                    operation === "delete"
                      ? { removido: r }
                      : operation.endsWith("Many")
                        ? { where: a.where, data: a.data, count: r?.count }
                        : (a.data ?? { create: a.create, update: a.update }),
                  ),
                },
              })
              .catch((e) => console.error("[auditoria] falha ao registar", e));
          }

          return resultado;
        },
      },
    },
  });
}

export function dbTenant(ctx: ContextoTenant) {
  const base = criarClienteTenant(ctx);
  const { tenantId } = ctx;

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "$transaction") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (arg: any, options?: any) => {
          if (typeof arg === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (target.$transaction as any)(async (tx: any) => {
              await ativarRlsTransacao(tx, tenantId);
              return arg(tx);
            }, options);
          }
          if (Array.isArray(arg)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await (target.$transaction as any)(
              [
                prisma.$executeRaw`SET LOCAL ROLE academia_app`,
                prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.rls_estrito', 'on', true)`,
                ...arg,
              ],
              options,
            );
            return res.slice(2);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (target.$transaction as any)(arg, options);
        };
      }
      const valor = Reflect.get(target, prop, receiver);
      return typeof valor === "function" ? valor.bind(target) : valor;
    },
  });
}

export type DbTenant = ReturnType<typeof criarClienteTenant>;
