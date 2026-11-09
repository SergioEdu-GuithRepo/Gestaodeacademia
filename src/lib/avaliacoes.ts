/** Avaliação de formadores: cinco critérios numa escala de 1 a 5 (funções puras). */

export const CRITERIOS = [
  { campo: "dominioConteudo", nome: "Domínio do conteúdo", curto: "Domínio" },
  { campo: "eticaProfissional", nome: "Ética profissional", curto: "Ética" },
  { campo: "cumprimentoHorarios", nome: "Cumprimento de horários e objetivos do curso", curto: "Horários e objetivos" },
  { campo: "enquadramentoExercicios", nome: "Enquadramento dos exercícios e dinâmica", curto: "Exercícios e dinâmica" },
  { campo: "capacidadeMotivar", nome: "Capacidade de motivar e captar a atenção dos formandos", curto: "Motivação" },
] as const;

export type CampoCriterio = (typeof CRITERIOS)[number]["campo"];
export type NotasAvaliacao = Record<CampoCriterio, number>;

function arred(n: number) {
  return Math.round(n * 10) / 10;
}

/** Média dos cinco critérios de uma avaliação. */
export function mediaAvaliacao(a: NotasAvaliacao): number {
  return arred(CRITERIOS.reduce((s, c) => s + a[c.campo], 0) / CRITERIOS.length);
}

/** Médias por critério e geral de várias avaliações (null se não houver avaliações). */
export function mediasAvaliacoes(lista: NotasAvaliacao[]): {
  total: number;
  geral: number | null;
  porCriterio: Record<CampoCriterio, number | null>;
} {
  const porCriterio = Object.fromEntries(
    CRITERIOS.map((c) => [
      c.campo,
      lista.length ? arred(lista.reduce((s, a) => s + a[c.campo], 0) / lista.length) : null,
    ]),
  ) as Record<CampoCriterio, number | null>;
  const geral = lista.length
    ? arred(lista.reduce((s, a) => s + CRITERIOS.reduce((t, c) => t + a[c.campo], 0), 0) / (lista.length * CRITERIOS.length))
    : null;
  return { total: lista.length, geral, porCriterio };
}

/** 4.3 → "4,3"; null → "—" */
export function formatNota(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
