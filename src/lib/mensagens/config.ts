import type { ConfiguracaoCentro, Prisma, PrismaClient } from "@prisma/client";
import { decifrar } from "@/lib/segredos";
import type { ConfigEvolution } from "@/lib/whatsapp/evolution";

/**
 * Cliente aceite pelas funções de mensagens: o cliente base, uma transação ou
 * o cliente isolado por centro. As funções indicam SEMPRE o `tenantId` de
 * forma explícita, por isso são seguras com qualquer um deles.
 */
export type Cliente = PrismaClient | Prisma.TransactionClient;

/**
 * Converte o cliente isolado por centro (`db`) ou a sua transação (`tx`) no
 * tipo base. Os tipos do cliente estendido não são atribuíveis diretamente,
 * mas a interface em tempo de execução é a mesma.
 */
export function comoCliente(c: object): Cliente {
  return c as unknown as Cliente;
}

export function nomeInstanciaPadrao(slugOuId: string): string {
  const limpo = slugOuId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `centro-${limpo || "academia"}`;
}

/** Indica se o servidor da plataforma tem EVOLUTION_API_URL e EVOLUTION_API_KEY definidos globalmente. */
export function temEvolutionGlobal(): boolean {
  return Boolean(process.env.EVOLUTION_API_URL?.trim() && process.env.EVOLUTION_API_KEY?.trim());
}

/** Obtém a configuração do centro, criando-a com os valores padrão se não existir. */
export async function obterConfiguracao(db: Cliente, tenantId: string): Promise<ConfiguracaoCentro> {
  const existente = await db.configuracaoCentro.findUnique({ where: { tenantId } });
  if (existente) return existente;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return db.configuracaoCentro.upsert({
    where: { tenantId },
    create: {
      tenantId,
      evolutionInstancia: nomeInstanciaPadrao(tenant?.slug ?? tenantId.slice(0, 12)),
    },
    update: {},
  });
}

/**
 * Credenciais da Evolution API (usa as credenciais próprias do centro ou,
 * por omissão, o servidor global EVOLUTION_API_URL / EVOLUTION_API_KEY da plataforma).
 */
export function configEvolution(cfg: ConfiguracaoCentro, tenantSlug?: string): ConfigEvolution | null {
  const url = cfg.evolutionUrl?.trim() || process.env.EVOLUTION_API_URL?.trim() || null;
  const apiKey = decifrar(cfg.evolutionApiKey) || process.env.EVOLUTION_API_KEY?.trim() || null;
  const instancia =
    cfg.evolutionInstancia?.trim() ||
    (cfg.evolutionUrl || process.env.EVOLUTION_API_URL
      ? nomeInstanciaPadrao(tenantSlug ?? cfg.tenantId.slice(0, 12))
      : null);
  if (!url || !instancia || !apiKey) return null;
  return { url, apiKey, instancia };
}
