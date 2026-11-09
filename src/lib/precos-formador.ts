import type { CategoriaFormacao } from "@prisma/client";

/**
 * Regras de valor/hora e horas lecionadas dos formadores (funções puras).
 * Valores monetários em cêntimos AOA (bigint).
 */

export type PrecosCategoria = {
  precoHoraComportamental: bigint | null;
  precoHoraTecnica: bigint | null;
};

/**
 * Valor/hora aplicável a um formador numa formação:
 * sobreposição específica da formação → preço da categoria → null (não definido).
 */
export function precoHoraFormador(
  formador: PrecosCategoria,
  categoria: CategoriaFormacao,
  override?: bigint | null,
): bigint | null {
  if (override !== null && override !== undefined) return override;
  const base = categoria === "COMPORTAMENTAL" ? formador.precoHoraComportamental : formador.precoHoraTecnica;
  return base ?? null;
}

type DecimalLike = { toString(): string };

export type SessaoHoras = {
  inicio: Date;
  fim: Date;
  horasLecionadas: DecimalLike | number | null;
};

/** Horas de uma sessão: horas lecionadas confirmadas ou, se nulas, a duração agendada. */
export function horasSessao(s: SessaoHoras): number {
  if (s.horasLecionadas !== null && s.horasLecionadas !== undefined) {
    const n = typeof s.horasLecionadas === "number" ? s.horasLecionadas : Number(s.horasLecionadas.toString());
    if (Number.isFinite(n)) return n;
  }
  const ms = s.fim.getTime() - s.inicio.getTime();
  return ms > 0 ? ms / 3_600_000 : 0;
}

/** Soma das horas de uma lista de sessões (arredondada a 2 casas). */
export function totalHoras(sessoes: Iterable<SessaoHoras>): number {
  let total = 0;
  for (const s of sessoes) total += horasSessao(s);
  return Math.round(total * 100) / 100;
}

const fmtHoras = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 });

/** 12.5 → "12,5 h" */
export function formatHoras(horas: number): string {
  return `${fmtHoras.format(horas)} h`;
}
