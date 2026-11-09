import type { PrismaClient } from "@prisma/client";
import { TZDate } from "@date-fns/tz";
import { dataSimples, formatData, TZ } from "@/lib/datas";
import { formatKz } from "@/lib/money";
import { comPago } from "@/lib/parcelas";
import { obterConfiguracao } from "./config";
import { enfileirarModelo } from "./enfileirar";
import { primeiroNome } from "./modelos";

/**
 * Agendador de mensagens automáticas (lembretes, atrasos, aniversários).
 * Corre periodicamente no worker; é idempotente graças às chaves únicas,
 * por isso pode correr muitas vezes por dia sem duplicar mensagens.
 */

/** Depois desta hora local não se iniciam envios agendados (evita mensagens à noite). */
export const HORA_LIMITE = 21;
/** Janela (dias) para recuperar avisos de atraso se o worker esteve parado. */
export const JANELA_ATRASO_DIAS = 3;

const DIA_MS = 86_400_000;

export function partesLocais(agora: Date): { hoje: string; hora: number } {
  const z = new TZDate(agora.getTime(), TZ);
  const hoje = `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
  return { hoje, hora: z.getHours() };
}

export function dentroDoHorario(hora: number, horaEnvio: number): boolean {
  return hora >= horaEnvio && hora < Math.max(horaEnvio + 1, HORA_LIMITE);
}

export function somarDias(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * DIA_MS);
}

export function diasEntre(de: Date, ate: Date): number {
  return Math.round((ate.getTime() - de.getTime()) / DIA_MS);
}

function bissexto(ano: number) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/** Faz anos hoje? (nascidos a 29/02 festejam a 28/02 em anos não bissextos) */
export function fazAnos(nascimento: Date, hoje: Date): boolean {
  const m = nascimento.getUTCMonth();
  const d = nascimento.getUTCDate();
  const hm = hoje.getUTCMonth();
  const hd = hoje.getUTCDate();
  if (m === hm && d === hd) return true;
  return m === 1 && d === 29 && hm === 1 && hd === 28 && !bissexto(hoje.getUTCFullYear());
}

export type ResumoAgendamento = { lembretes: number; atrasos: number; aniversarios: number };

export async function agendarCentro(prisma: PrismaClient, tenantId: string, agora = new Date()): Promise<ResumoAgendamento> {
  const resumo: ResumoAgendamento = { lembretes: 0, atrasos: 0, aniversarios: 0 };
  const cfg = await obterConfiguracao(prisma, tenantId);
  if (cfg.whatsappModo === "DESATIVADO") return resumo;

  const { hoje: hojeIso, hora } = partesLocais(agora);
  if (!dentroDoHorario(hora, cfg.horaEnvio)) return resumo;
  const hoje = dataSimples(hojeIso);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { nome: true } });
  const centro = tenant?.nome ?? "";

  const maxAtraso = cfg.diasAposAtraso.length ? Math.max(...cfg.diasAposAtraso) : -1;
  const precisaParcelas = cfg.lembretesAtivos || maxAtraso >= 0;

  if (precisaParcelas) {
    const desde = maxAtraso >= 0 ? somarDias(hoje, -(maxAtraso + JANELA_ATRASO_DIAS - 1)) : hoje;
    const ate = cfg.lembretesAtivos ? somarDias(hoje, cfg.diasAntesVencimento) : somarDias(hoje, -1);

    const parcelas = await prisma.parcela.findMany({
      where: {
        tenantId,
        vencimento: { gte: desde, lte: ate },
        matricula: { estado: "ATIVA" },
      },
      include: {
        alocacoes: { select: { valor: true } },
        matricula: {
          select: {
            id: true,
            formando: { select: { id: true, nome: true, whatsapp: true } },
            turma: { select: { formacao: { select: { nome: true } } } },
            parcelas: { select: { valor: true, alocacoes: { select: { valor: true } } } },
          },
        },
      },
    });

    for (const bruta of parcelas) {
      const p = comPago(bruta);
      if (p.pago >= p.valor) continue;
      const { matricula } = p;
      const formando = matricula.formando;
      const em = diasEntre(p.vencimento, hoje); // >0 = dias de atraso; <=0 = faltam dias
      const vencimentoIso = p.vencimento.toISOString().slice(0, 10);
      const base = {
        primeiroNome: primeiroNome(formando.nome),
        nome: formando.nome,
        formacao: matricula.turma.formacao.nome,
        numeroParcela: p.numero,
        valor: formatKz(p.valor - p.pago),
        vencimento: formatData(p.vencimento),
        centro,
      };
      const refs = { formandoId: formando.id, matriculaId: matricula.id, parcelaId: p.id };

      if (em <= 0 && cfg.lembretesAtivos && -em <= cfg.diasAntesVencimento) {
        const r = await enfileirarModelo(prisma, {
          tenantId,
          tipo: "LEMBRETE_VENCIMENTO",
          destino: formando.whatsapp,
          chave: `lembrete:${p.id}:${vencimentoIso}`,
          refs,
          vars: base,
        });
        if (r === "ENFILEIRADA") resumo.lembretes++;
      } else if (em > 0) {
        // O aviso do dia d é enviado entre d e d+JANELA-1 dias de atraso (recupera paragens do worker).
        const d = cfg.diasAposAtraso.filter((x) => em >= x && em < x + JANELA_ATRASO_DIAS).sort((a, b) => b - a)[0];
        if (d === undefined) continue;
        const divida = matricula.parcelas
          .map(comPago)
          .reduce((s, x) => s + (x.valor > x.pago ? x.valor - x.pago : 0n), 0n);
        const r = await enfileirarModelo(prisma, {
          tenantId,
          tipo: "PARCELA_ATRASO",
          destino: formando.whatsapp,
          chave: `atraso:${p.id}:${d}`,
          refs,
          vars: { ...base, diasAtraso: em, divida: formatKz(divida) },
        });
        if (r === "ENFILEIRADA") resumo.atrasos++;
      }
    }
  }

  if (cfg.aniversariosAtivos) {
    const formandos = await prisma.formando.findMany({
      where: { tenantId, dataNascimento: { not: null } },
      select: { id: true, nome: true, whatsapp: true, dataNascimento: true },
    });
    for (const f of formandos) {
      if (!f.dataNascimento || !fazAnos(f.dataNascimento, hoje)) continue;
      const r = await enfileirarModelo(prisma, {
        tenantId,
        tipo: "ANIVERSARIO",
        destino: f.whatsapp,
        chave: `aniversario:${f.id}:${hoje.getUTCFullYear()}`,
        refs: { formandoId: f.id },
        vars: { primeiroNome: primeiroNome(f.nome), nome: f.nome, centro },
      });
      if (r === "ENFILEIRADA") resumo.aniversarios++;
    }
  }

  return resumo;
}

export async function agendarTodos(prisma: PrismaClient, agora = new Date()) {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const total: ResumoAgendamento = { lembretes: 0, atrasos: 0, aniversarios: 0 };
  for (const t of tenants) {
    try {
      const r = await agendarCentro(prisma, t.id, agora);
      total.lembretes += r.lembretes;
      total.atrasos += r.atrasos;
      total.aniversarios += r.aniversarios;
    } catch (e) {
      console.error(`[agendador] erro no centro ${t.id}`, e);
    }
  }
  return total;
}
