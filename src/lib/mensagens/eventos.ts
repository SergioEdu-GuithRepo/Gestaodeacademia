import { dataSimples, diaLocal, formatData } from "@/lib/datas";
import { formatKz } from "@/lib/money";
import { comPago } from "@/lib/parcelas";
import { obterConfiguracao, type Cliente } from "./config";
import { enfileirarModelo } from "./enfileirar";
import { primeiroNome } from "./modelos";

/**
 * Eventos de negócio que geram mensagens. Devem ser chamados DENTRO da
 * transação que regista o evento: se a transação falhar, nenhuma mensagem
 * fica na fila; se tiver sucesso, a mensagem fica garantidamente registada.
 */

export function urlApp(caminho = ""): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}${caminho}` : caminho;
}

async function nomeCentro(db: Cliente, tenantId: string): Promise<string> {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { nome: true } });
  return t?.nome ?? "";
}

export function formatarSugestoes(formacoes: { nome: string; preco: bigint }[]): string {
  if (formacoes.length === 0) return "• Consulte o nosso catálogo de formações.";
  return formacoes.map((f) => `• ${f.nome} — ${formatKz(f.preco)}`).join("\n");
}

/** Confirmação de pagamento + (se a dívida ficar a zero) mensagem de plano concluído. */
export async function aoRegistarPagamento(db: Cliente, { tenantId, pagamentoId }: { tenantId: string; pagamentoId: string }) {
  const cfg = await obterConfiguracao(db, tenantId);
  if (cfg.whatsappModo === "DESATIVADO" || !cfg.confirmacoesAtivas) return;

  const pagamento = await db.pagamento.findFirst({
    where: { id: pagamentoId, tenantId },
    include: {
      formando: { select: { id: true, nome: true, whatsapp: true } },
      matricula: {
        include: {
          turma: { include: { formacao: { select: { id: true, nome: true } } } },
          parcelas: { include: { alocacoes: { select: { valor: true } } } },
        },
      },
    },
  });
  if (!pagamento) return;

  const { formando, matricula } = pagamento;
  const parcelas = matricula.parcelas.map(comPago);
  const divida = parcelas.reduce((s, p) => s + (p.valor > p.pago ? p.valor - p.pago : 0n), 0n);
  const emFalta = parcelas.filter((p) => p.pago < p.valor).length;
  const centro = await nomeCentro(db, tenantId);
  const formacao = matricula.turma.formacao.nome;
  const refs = { formandoId: formando.id, matriculaId: matricula.id, pagamentoId: pagamento.id };

  await enfileirarModelo(db, {
    tenantId,
    tipo: "CONFIRMACAO_PAGAMENTO",
    destino: formando.whatsapp,
    chave: `pagamento:${pagamento.id}`,
    refs,
    vars: {
      primeiroNome: primeiroNome(formando.nome),
      nome: formando.nome,
      valor: formatKz(pagamento.valor),
      formacao,
      parcelasEmFalta: emFalta,
      divida: formatKz(divida),
      centro,
    },
  });

  if (divida === 0n) {
    const compradas = await db.matricula.findMany({
      where: { tenantId, formandoId: formando.id, estado: { not: "CANCELADA" } },
      select: { turma: { select: { formacaoId: true } } },
    });
    const sugestoes = await db.formacao.findMany({
      where: { tenantId, ativa: true, id: { notIn: compradas.map((c) => c.turma.formacaoId) } },
      select: { nome: true, preco: true },
      orderBy: { nome: "asc" },
      take: 3,
    });
    await enfileirarModelo(db, {
      tenantId,
      tipo: "PLANO_CONCLUIDO",
      destino: formando.whatsapp,
      chave: `concluido:${matricula.id}`,
      refs,
      // Enviada um pouco depois da confirmação, para chegar pela ordem certa.
      enviarApos: new Date(Date.now() + 60_000),
      vars: {
        primeiroNome: primeiroNome(formando.nome),
        nome: formando.nome,
        formacao,
        sugestoes: formatarSugestoes(sugestoes),
        centro,
      },
    });
  }
}

export function origemLead(l: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
}): string {
  const partes = [l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean);
  if (partes.length) return partes.join(" / ");
  if (l.fbclid) return "Facebook / Instagram (anúncio)";
  if (l.referrer) {
    try {
      return new URL(l.referrer).hostname;
    } catch {
      return l.referrer;
    }
  }
  return "Direto";
}

/** Notifica a equipa comercial de um novo lead qualificado. */
export async function aoCriarLead(db: Cliente, { tenantId, leadId }: { tenantId: string; leadId: string }) {
  const cfg = await obterConfiguracao(db, tenantId);
  if (cfg.whatsappModo === "DESATIVADO" || cfg.numerosEquipaComercial.length === 0) return;

  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId },
    include: {
      formacao: { select: { nome: true } },
      turma: { select: { codigo: true, sessoes: { select: { inicio: true }, orderBy: { inicio: "asc" }, take: 1 } } },
    },
  });
  if (!lead) return;

  const inicio = lead.turma?.sessoes[0]?.inicio;
  const turma = lead.turma
    ? `${lead.turma.codigo}${inicio ? ` (início ${formatData(dataSimples(diaLocal(inicio)))})` : ""}`
    : "sem turma definida";

  for (const numero of cfg.numerosEquipaComercial) {
    await enfileirarModelo(db, {
      tenantId,
      tipo: "NOVO_LEAD",
      destino: numero,
      chave: `lead:${lead.id}:${numero}`,
      refs: { leadId: lead.id },
      vars: {
        nome: lead.nome,
        whatsapp: lead.whatsapp,
        formacao: lead.formacao.nome,
        turma,
        preco: formatKz(lead.precoApresentado),
        origem: origemLead(lead),
        link: urlApp(`/leads?id=${lead.id}`),
      },
    });
  }
}
