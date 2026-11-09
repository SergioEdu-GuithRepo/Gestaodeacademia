import type { DbTenant } from "./db";
import { formatDataHora, formatHora } from "./datas";

/**
 * Validação de conflitos de agenda (regra crítica do módulo 4.5).
 *
 * Camada 1 (aqui): verificação antes de gravar, com mensagens claras.
 * Camada 2 (BD): exclusion constraints em "Sessao" impedem conflitos mesmo
 * com gravações simultâneas — ver prisma/migrations/*_conflitos_agenda.
 *
 * Intervalos são semi-abertos [inicio, fim): uma sessão 10:00–12:00 e outra
 * 12:00–14:00 NÃO estão em conflito.
 */

export type Intervalo = { inicio: Date; fim: Date };

export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}

export type DadosSessao = Intervalo & {
  id?: string;
  turmaId: string;
  formadorId: string;
  salaId: string;
};

export type TipoConflito = "TURMA" | "FORMADOR" | "SALA";
export type Conflito = { tipo: TipoConflito; sessaoId: string; mensagem: string };

export function validarIntervalo({ inicio, fim }: Intervalo): string | null {
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return "Data ou hora inválida.";
  if (fim.getTime() <= inicio.getTime()) return "A hora de fim tem de ser posterior à hora de início.";
  if (fim.getTime() - inicio.getTime() > 12 * 60 * 60 * 1000) return "Uma sessão não pode durar mais de 12 horas.";
  return null;
}

/** Classifica os conflitos de uma sessão candidata face a sessões existentes. */
export function classificarConflitos(
  nova: DadosSessao,
  existentes: (DadosSessao & {
    id: string;
    turma: { codigo: string; formacao: { nome: string } };
    formador: { nome: string };
    sala: { nome: string };
  })[],
): Conflito[] {
  const conflitos: Conflito[] = [];
  for (const s of existentes) {
    if (s.id === nova.id || !sobrepoe(nova, s)) continue;
    const quando = `${formatDataHora(s.inicio)}–${formatHora(s.fim)}`;
    const desc = `${s.turma.formacao.nome} (${s.turma.codigo})`;
    if (s.turmaId === nova.turmaId)
      conflitos.push({ tipo: "TURMA", sessaoId: s.id, mensagem: `A turma já tem uma sessão em ${quando}.` });
    if (s.formadorId === nova.formadorId)
      conflitos.push({
        tipo: "FORMADOR",
        sessaoId: s.id,
        mensagem: `O formador ${s.formador.nome} já está alocado em ${quando} — ${desc}.`,
      });
    if (s.salaId === nova.salaId)
      conflitos.push({
        tipo: "SALA",
        sessaoId: s.id,
        mensagem: `A sala ${s.sala.nome} já está ocupada em ${quando} — ${desc}.`,
      });
  }
  return conflitos;
}

/** Procura na BD sessões (não canceladas) em conflito com a sessão candidata. */
export async function procurarConflitos(db: DbTenant, nova: DadosSessao): Promise<Conflito[]> {
  const existentes = await db.sessao.findMany({
    where: {
      estado: { not: "CANCELADA" },
      ...(nova.id ? { id: { not: nova.id } } : {}),
      inicio: { lt: nova.fim },
      fim: { gt: nova.inicio },
      OR: [{ turmaId: nova.turmaId }, { formadorId: nova.formadorId }, { salaId: nova.salaId }],
    },
    include: {
      turma: { select: { codigo: true, formacao: { select: { nome: true } } } },
      formador: { select: { nome: true } },
      sala: { select: { nome: true } },
    },
    orderBy: { inicio: "asc" },
  });
  return classificarConflitos(nova, existentes);
}

/** Verdadeiro se o erro vier de uma exclusion constraint de conflito de agenda. */
export function eErroConflitoBD(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("23P01") || msg.includes("exclusion constraint") || msg.includes("sem_conflito");
}
