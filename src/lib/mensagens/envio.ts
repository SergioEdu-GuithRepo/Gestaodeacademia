import type { PrismaClient, TipoMensagem } from "@prisma/client";
import { ErroEnvio, enviarTexto, type ConfigEvolution } from "@/lib/whatsapp/evolution";
import { configEvolution, obterConfiguracao } from "./config";

/**
 * Processamento da fila de mensagens (usado pelo worker).
 *
 * - Reclama mensagens com `FOR UPDATE SKIP LOCKED` (vários workers não enviam
 *   a mesma mensagem) e marca-as ENVIANDO antes de contactar a Evolution API.
 * - Respeita o intervalo mínimo entre envios de cada centro.
 * - Erros transitórios → nova tentativa com espera crescente; erros permanentes
 *   ou tentativas esgotadas → FALHADA com o erro registado (visível em /mensagens).
 */

export const MAX_TENTATIVAS = 5;
/** Espera antes da 2.ª, 3.ª, 4.ª e 5.ª tentativas. */
export const ESPERAS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000];
/** Mensagens em ENVIANDO há mais do que isto (ex.: worker reiniciado) voltam à fila. */
export const PRESA_APOS_MS = 5 * 60_000;
const LOTE_SIMULACAO = 50;

/** Próxima tentativa após `tentativas` falhadas, ou null se se deve desistir. */
export function proximaTentativa(tentativas: number, agora: Date): Date | null {
  if (tentativas >= MAX_TENTATIVAS) return null;
  const espera = ESPERAS_MS[Math.min(tentativas - 1, ESPERAS_MS.length - 1)] ?? ESPERAS_MS[0];
  return new Date(agora.getTime() + espera);
}

export type Enviador = (cfg: ConfigEvolution, destino: string, texto: string) => Promise<string | null>;

export type EstadoWorker = {
  /** Último envio real (ms) por centro, para respeitar intervaloEnvioSegundos. */
  ultimoEnvio: Map<string, number>;
};

export type ResumoLote = { processadas: number; enviadas: number; reagendadas: number; falhadas: number; canceladas: number };

type Reclamada = {
  id: string;
  tenantId: string;
  tipo: TipoMensagem;
  destino: string;
  texto: string;
  tentativas: number;
  parcelaId: string | null;
};

export async function recuperarPresas(prisma: PrismaClient, agora = new Date()): Promise<number> {
  const r = await prisma.mensagem.updateMany({
    where: { estado: "ENVIANDO", updatedAt: { lt: new Date(agora.getTime() - PRESA_APOS_MS) } },
    data: { estado: "PENDENTE", proximaTentativa: agora, erro: "Envio interrompido; nova tentativa." },
  });
  return r.count;
}

async function reclamar(prisma: PrismaClient, tenantId: string, agora: Date, limite: number): Promise<Reclamada[]> {
  return prisma.$queryRaw<Reclamada[]>`
    UPDATE "Mensagem" SET estado = 'ENVIANDO', tentativas = tentativas + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Mensagem"
      WHERE "tenantId" = ${tenantId} AND estado = 'PENDENTE' AND "proximaTentativa" <= ${agora}
      ORDER BY "proximaTentativa", "createdAt"
      LIMIT ${limite}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "tenantId", tipo, destino, texto, tentativas, "parcelaId"`;
}

/** Lembretes/avisos de parcelas que entretanto foram pagas já não são enviados. */
async function parcelaJaPaga(prisma: PrismaClient, m: Reclamada): Promise<boolean> {
  if (!m.parcelaId || (m.tipo !== "LEMBRETE_VENCIMENTO" && m.tipo !== "PARCELA_ATRASO")) return false;
  const p = await prisma.parcela.findUnique({
    where: { id: m.parcelaId },
    select: { valor: true, alocacoes: { select: { valor: true } }, matricula: { select: { estado: true } } },
  });
  if (!p) return true;
  const pago = p.alocacoes.reduce((s, a) => s + a.valor, 0n);
  return pago >= p.valor || p.matricula.estado !== "ATIVA";
}

export async function processarFila(
  prisma: PrismaClient,
  estado: EstadoWorker,
  opcoes: { agora?: Date; enviar?: Enviador; /** Limita a um centro (testes). */ apenasCentro?: string } = {},
): Promise<ResumoLote> {
  const agora = opcoes.agora ?? new Date();
  const enviar = opcoes.enviar ?? enviarTexto;
  const resumo: ResumoLote = { processadas: 0, enviadas: 0, reagendadas: 0, falhadas: 0, canceladas: 0 };

  const centros = await prisma.mensagem.groupBy({
    by: ["tenantId"],
    where: {
      estado: "PENDENTE",
      proximaTentativa: { lte: agora },
      ...(opcoes.apenasCentro ? { tenantId: opcoes.apenasCentro } : {}),
    },
  });

  for (const { tenantId } of centros) {
    const cfg = await obterConfiguracao(prisma, tenantId);

    if (cfg.whatsappModo === "DESATIVADO") {
      const r = await prisma.mensagem.updateMany({
        where: { tenantId, estado: "PENDENTE", proximaTentativa: { lte: agora } },
        data: { estado: "CANCELADA", erro: "WhatsApp desativado nas configurações." },
      });
      resumo.canceladas += r.count;
      continue;
    }

    const simulacao = cfg.whatsappModo === "SIMULACAO";
    if (!simulacao) {
      const ultimo = estado.ultimoEnvio.get(tenantId) ?? 0;
      if (agora.getTime() - ultimo < cfg.intervaloEnvioSegundos * 1000) continue;
    }

    const mensagens = await reclamar(prisma, tenantId, agora, simulacao ? LOTE_SIMULACAO : 1);
    const evo = simulacao ? null : configEvolution(cfg);

    for (const m of mensagens) {
      resumo.processadas++;

      if (await parcelaJaPaga(prisma, m)) {
        await prisma.mensagem.update({
          where: { id: m.id },
          data: { estado: "CANCELADA", erro: "Parcela entretanto paga (ou matrícula inativa)." },
        });
        resumo.canceladas++;
        continue;
      }

      if (simulacao) {
        await prisma.mensagem.update({
          where: { id: m.id },
          data: { estado: "ENVIADA", idExterno: `sim-${m.id}`, enviadaEm: agora, erro: null },
        });
        resumo.enviadas++;
        continue;
      }

      estado.ultimoEnvio.set(tenantId, agora.getTime());
      try {
        if (!evo) throw new ErroEnvio("Evolution API não configurada (URL, chave ou instância em falta).", false);
        const idExterno = await enviar(evo, m.destino, m.texto);
        await prisma.mensagem.update({
          where: { id: m.id },
          data: { estado: "ENVIADA", idExterno, enviadaEm: new Date(), erro: null },
        });
        resumo.enviadas++;
      } catch (e) {
        const erro = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
        const permanente = e instanceof ErroEnvio && e.permanente;
        const proxima = permanente ? null : proximaTentativa(m.tentativas, agora);
        if (proxima) {
          await prisma.mensagem.update({
            where: { id: m.id },
            data: { estado: "PENDENTE", proximaTentativa: proxima, erro },
          });
          resumo.reagendadas++;
        } else {
          await prisma.mensagem.update({ where: { id: m.id }, data: { estado: "FALHADA", erro } });
          resumo.falhadas++;
          console.error(`[worker] mensagem ${m.id} FALHADA (${tenantId}): ${erro}`);
        }
      }
    }
  }
  return resumo;
}
