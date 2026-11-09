import type { TipoMensagem } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { normalizarWhatsapp } from "@/lib/utils";
import { obterConfiguracao, type Cliente } from "./config";
import { processarFila, type EstadoWorker } from "./envio";
import { MODELOS_PADRAO, renderizar, type TipoModelo } from "./modelos";

/**
 * Enfileiramento de mensagens (outbox).
 *
 * As mensagens são gravadas na tabela `Mensagem` (de preferência dentro da
 * mesma transação que as origina) e enviadas pelo worker ou imediatamente em
 * background (`after`) em ambientes serverless como a Vercel. A `chave` garante
 * idempotência: a mesma chave nunca gera duas mensagens no mesmo centro.
 * Números inválidos ficam registados como FALHADA — nada falha em silêncio.
 */

const estadoServerless: EstadoWorker = { ultimoEnvio: new Map() };

function dispararFilaAssincrona(tenantId: string) {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return;

  const tarefa = async () => {
    try {
      // Aguarda brevemente para garantir que qualquer $transaction envolvente já fez commit
      await new Promise((r) => setTimeout(r, 250));
      await processarFila(prisma, estadoServerless, { apenasCentro: tenantId });
    } catch {
      // Se falhar, fica PENDENTE para o próximo ciclo do worker / cron
    }
  };

  try {
    after(tarefa);
  } catch {
    void tarefa();
  }
}

export type RefsMensagem = {
  formandoId?: string | null;
  leadId?: string | null;
  matriculaId?: string | null;
  parcelaId?: string | null;
  pagamentoId?: string | null;
  campanhaId?: string | null;
  criadaPorId?: string | null;
};

export type NovaMensagem = {
  tenantId: string;
  tipo: TipoMensagem;
  destino: string;
  texto: string;
  chave?: string | null;
  refs?: RefsMensagem;
  /** Data a partir da qual pode ser enviada (padrão: já). */
  enviarApos?: Date;
  /** Enfileira mesmo com o WhatsApp desativado (ex.: mensagens manuais). */
  forcar?: boolean;
};

export type ResultadoEnfileirar = "ENFILEIRADA" | "DUPLICADA" | "DESATIVADO" | "MODELO_INATIVO" | "NUMERO_INVALIDO";

export async function enfileirar(db: Cliente, m: NovaMensagem): Promise<ResultadoEnfileirar> {
  if (!m.forcar) {
    const cfg = await obterConfiguracao(db, m.tenantId);
    if (cfg.whatsappModo === "DESATIVADO") return "DESATIVADO";
  }

  const destino = normalizarWhatsapp(m.destino);
  const r = await db.mensagem.createMany({
    data: [
      {
        tenantId: m.tenantId,
        tipo: m.tipo,
        destino: destino ?? m.destino,
        texto: m.texto,
        chave: m.chave ?? null,
        estado: destino ? "PENDENTE" : "FALHADA",
        erro: destino ? null : "Número de WhatsApp inválido.",
        proximaTentativa: m.enviarApos ?? new Date(),
        ...m.refs,
      },
    ],
    skipDuplicates: true,
  });
  if (r.count === 0) return "DUPLICADA";
  if (destino) {
    dispararFilaAssincrona(m.tenantId);
    return "ENFILEIRADA";
  }
  return "NUMERO_INVALIDO";
}

/** Texto do modelo do centro (ou o padrão) e se está ativo. */
export async function obterModelo(db: Cliente, tenantId: string, tipo: TipoModelo) {
  const personalizado = await db.modeloMensagem.findUnique({ where: { tenantId_tipo: { tenantId, tipo } } });
  return {
    texto: personalizado?.texto ?? MODELOS_PADRAO[tipo].texto,
    ativo: personalizado?.ativo ?? true,
    personalizado: !!personalizado,
  };
}

/** Renderiza o modelo do tipo indicado e enfileira-o (ignora se o modelo estiver inativo). */
export async function enfileirarModelo(
  db: Cliente,
  m: Omit<NovaMensagem, "texto" | "tipo"> & { tipo: TipoModelo; vars: Record<string, string | number | null | undefined> },
): Promise<ResultadoEnfileirar> {
  const modelo = await obterModelo(db, m.tenantId, m.tipo);
  if (!modelo.ativo) return "MODELO_INATIVO";
  const { vars, ...resto } = m;
  return enfileirar(db, { ...resto, texto: renderizar(modelo.texto, vars) });
}
