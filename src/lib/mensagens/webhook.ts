import type { EstadoMensagem, Prisma, PrismaClient } from "@prisma/client";

/**
 * Interpretação dos webhooks da Evolution API (v2) para atualizar o estado
 * de entrega das mensagens. O estado nunca recua (ex.: LIDA não volta a ENTREGUE).
 */

export type AtualizacaoEstado = { idExterno: string; estado: EstadoMensagem; erro?: string };

const POR_STATUS: Record<string, EstadoMensagem> = {
  ERROR: "FALHADA",
  SERVER_ACK: "ENVIADA",
  DELIVERY_ACK: "ENTREGUE",
  READ: "LIDA",
  PLAYED: "LIDA",
};
// Algumas versões enviam o status numérico (proto WAMessageStatus).
const POR_NUMERO: Record<number, EstadoMensagem> = { 0: "FALHADA", 2: "ENVIADA", 3: "ENTREGUE", 4: "LIDA", 5: "LIDA" };

const ORDEM: Partial<Record<EstadoMensagem, number>> = {
  PENDENTE: 0,
  ENVIANDO: 1,
  ENVIADA: 2,
  ENTREGUE: 3,
  LIDA: 4,
};

/** Pode passar de `atual` para `novo`? */
export function podeTransitar(atual: EstadoMensagem, novo: EstadoMensagem): boolean {
  if (atual === novo || atual === "CANCELADA") return false;
  if (novo === "FALHADA") return atual === "ENVIANDO" || atual === "ENVIADA";
  if (atual === "FALHADA") return novo === "ENTREGUE" || novo === "LIDA"; // afinal chegou
  const a = ORDEM[atual];
  const n = ORDEM[novo];
  return a !== undefined && n !== undefined && n > a;
}

function estadoDe(status: unknown): EstadoMensagem | null {
  if (typeof status === "number") return POR_NUMERO[status] ?? null;
  if (typeof status === "string") {
    const s = status.toUpperCase();
    if (/^\d+$/.test(s)) return POR_NUMERO[Number(s)] ?? null;
    return POR_STATUS[s] ?? null;
  }
  return null;
}

/** Extrai as atualizações de estado de um corpo de webhook (eventos messages.update / send.message). */
export function interpretarWebhook(corpo: unknown): AtualizacaoEstado[] {
  if (!corpo || typeof corpo !== "object") return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = corpo as any;
  const evento = String(c.event ?? "").toLowerCase().replace(/_/g, ".");
  if (evento && evento !== "messages.update" && evento !== "send.message") return [];

  const itens: unknown[] = Array.isArray(c.data) ? c.data : c.data ? [c.data] : [];
  const out: AtualizacaoEstado[] = [];
  for (const item of itens) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = item as any;
    if (!d || typeof d !== "object") continue;
    if (d.fromMe === false || d.key?.fromMe === false) continue; // só mensagens enviadas por nós
    const idExterno = d.keyId ?? d.key?.id ?? d.messageId ?? d.id;
    const estado = estadoDe(d.status ?? d.update?.status);
    if (typeof idExterno !== "string" || !idExterno || !estado) continue;
    out.push({
      idExterno,
      estado,
      ...(estado === "FALHADA" ? { erro: "Evolution API reportou erro na entrega." } : {}),
    });
  }
  return out;
}

/** Aplica as atualizações às mensagens do centro. Devolve quantas mudaram. */
export async function aplicarAtualizacoes(
  prisma: PrismaClient,
  tenantId: string,
  atualizacoes: AtualizacaoEstado[],
  agora = new Date(),
): Promise<number> {
  let n = 0;
  for (const a of atualizacoes) {
    const m = await prisma.mensagem.findFirst({
      where: { tenantId, idExterno: a.idExterno },
      select: { id: true, estado: true, enviadaEm: true, entregueEm: true, lidaEm: true },
    });
    if (!m || !podeTransitar(m.estado, a.estado)) continue;
    const data: Prisma.MensagemUpdateManyMutationInput = { estado: a.estado };
    if (a.estado === "ENVIADA" && !m.enviadaEm) data.enviadaEm = agora;
    if (a.estado === "ENTREGUE" || a.estado === "LIDA") {
      if (!m.enviadaEm) data.enviadaEm = agora;
      if (!m.entregueEm) data.entregueEm = agora;
      if (m.estado === "FALHADA") data.erro = null;
    }
    if (a.estado === "LIDA" && !m.lidaEm) data.lidaEm = agora;
    if (a.estado === "FALHADA") data.erro = a.erro ?? "Falha reportada pela Evolution API.";
    // Atualização condicional: não sobrepõe uma mudança concorrente.
    const r = await prisma.mensagem.updateMany({ where: { id: m.id, estado: m.estado }, data });
    n += r.count;
  }
  return n;
}
