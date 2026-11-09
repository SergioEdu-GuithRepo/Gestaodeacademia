import { TZDate, tz } from "@date-fns/tz";
import { addMonths, format } from "date-fns";
import { pt } from "date-fns/locale";

/**
 * Datas e horas.
 * - Instantes (início/fim de sessão) são guardados em UTC e apresentados no
 *   fuso do centro (Africa/Luanda, UTC+1, sem horário de verão).
 * - Datas sem hora (vencimentos, aniversários — colunas @db.Date) são
 *   representadas como meia-noite UTC e nunca convertidas de fuso.
 */
export const TZ = process.env.APP_TIMEZONE || "Africa/Luanda";
const noFuso = tz(TZ);

// ── Instantes ────────────────────────────────────────────────────────────────

/** "2026-10-20" + "14:30" (hora local do centro) → Date (instante UTC). */
export function instanteLocal(data: string, hora: string): Date {
  const [a, m, d] = data.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  if ([a, m, d, h, min].some((n) => Number.isNaN(n))) throw new Error("Data/hora inválida");
  return new Date(new TZDate(a, m - 1, d, h, min, 0, TZ).getTime());
}

export function formatHora(d: Date): string {
  return format(d, "HH:mm", { in: noFuso });
}

export function formatDataHora(d: Date): string {
  return format(d, "dd/MM/yyyy HH:mm", { in: noFuso });
}

/** Data local (yyyy-MM-dd) de um instante, no fuso do centro. */
export function diaLocal(d: Date): string {
  return format(d, "yyyy-MM-dd", { in: noFuso });
}

/** Primeira letra em maiúscula (o CSS `capitalize` poria "De Outubro"). */
function maiuscula(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDiaSemana(d: Date): string {
  return maiuscula(format(d, "EEEE, d 'de' MMMM", { in: noFuso, locale: pt }));
}

/** Hoje (yyyy-MM-dd) no fuso do centro. */
export function hojeLocal(): string {
  return diaLocal(new Date());
}

// ── Datas simples (@db.Date) ─────────────────────────────────────────────────

/** "2026-10-20" → Date à meia-noite UTC (para colunas @db.Date). */
export function dataSimples(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Data inválida");
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Data inválida");
  return d;
}

/** Date (@db.Date) → "2026-10-20" para inputs type="date". */
export function dataSimplesIso(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** Date (@db.Date) → "20/10/2026". */
export function formatData(d: Date | null | undefined): string {
  if (!d) return "—";
  const [a, m, dia] = dataSimplesIso(d).split("-");
  return `${dia}/${m}/${a}`;
}

/** Soma meses a uma data simples, preservando a semântica UTC. */
export function somarMeses(d: Date, meses: number): Date {
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const r = addMonths(local, meses);
  return new Date(Date.UTC(r.getFullYear(), r.getMonth(), r.getDate()));
}

export function formatMes(ano: number, mes: number): string {
  return maiuscula(format(new Date(ano, mes - 1, 1), "MMMM 'de' yyyy", { locale: pt }));
}
