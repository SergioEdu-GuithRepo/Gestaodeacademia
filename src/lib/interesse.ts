/**
 * Nível de interesse de um formando (módulo 4.2).
 *
 * O briefing deixa em aberto a fórmula exata — por isso a regra está isolada
 * aqui, é pura (sem BD) e todos os pesos/limiares são configuráveis.
 *
 * Fórmula por omissão (pontuação 0–100):
 *
 * | Critério                     | Pontos                                             |
 * | ---------------------------- | -------------------------------------------------- |
 * | Formações compradas          | 10 por formação, até 30 (3 ou mais)                |
 * | Recência da última compra    | ≤ 90 dias: 20 · ≤ 180: 12 · ≤ 365: 6 · mais: 0     |
 * | Avaliação da equipa (1–5)    | linear de 0 (1) a 25 (5); sem avaliação conta 3    |
 * | Intenção de comprar          | 25 se sim                                          |
 * | Parcelas em atraso           | −10 por parcela, até −20                           |
 *
 * A pontuação é limitada a 0–100 e arredondada. Com `pontuacao ≥ 50` o
 * formando tem "MUITO" interesse; abaixo disso, "POUCO".
 */

export type NivelInteresse = "MUITO" | "POUCO";

export type DadosInteresse = {
  /** N.º de formações compradas (matrículas não canceladas). */
  formacoesCompradas: number;
  /** Dias desde a última compra; `null` se nunca comprou. */
  diasDesdeUltimaCompra: number | null;
  /** N.º de parcelas vencidas e não totalmente pagas. */
  parcelasEmAtraso: number;
  /** Avaliação comercial da equipa (1–5) ou `null` se não avaliado. */
  avaliacaoEquipa: number | null;
  /** O formando manifestou intenção de comprar. */
  intencaoCompra: boolean;
};

export type ConfigInteresse = {
  pontosPorFormacao: number;
  maxPontosFormacoes: number;
  /** Escalões de recência, do mais recente para o mais antigo. */
  recencia: { ateDias: number; pontos: number }[];
  maxPontosAvaliacao: number;
  /** Avaliação assumida quando a equipa ainda não avaliou o formando. */
  avaliacaoPorOmissao: number;
  pontosIntencaoCompra: number;
  penalizacaoPorParcelaEmAtraso: number;
  maxPenalizacaoAtraso: number;
  /** Pontuação mínima (inclusive) para "MUITO" interesse. */
  limiarMuitoInteresse: number;
};

export const CONFIG_INTERESSE: ConfigInteresse = {
  pontosPorFormacao: 10,
  maxPontosFormacoes: 30,
  recencia: [
    { ateDias: 90, pontos: 20 },
    { ateDias: 180, pontos: 12 },
    { ateDias: 365, pontos: 6 },
  ],
  maxPontosAvaliacao: 25,
  avaliacaoPorOmissao: 3,
  pontosIntencaoCompra: 25,
  penalizacaoPorParcelaEmAtraso: 10,
  maxPenalizacaoAtraso: 20,
  limiarMuitoInteresse: 50,
};

/** Atalho para o limiar por omissão. */
export const LIMIAR_MUITO_INTERESSE = CONFIG_INTERESSE.limiarMuitoInteresse;

export const NOMES_NIVEL_INTERESSE: Record<NivelInteresse, string> = {
  MUITO: "Muito interesse",
  POUCO: "Pouco interesse",
};

export function calcularInteresse(
  dados: DadosInteresse,
  config: ConfigInteresse = CONFIG_INTERESSE,
): { pontuacao: number; nivel: NivelInteresse } {
  const formacoes = Math.max(0, Math.floor(dados.formacoesCompradas));
  const ptsFormacoes = Math.min(formacoes * config.pontosPorFormacao, config.maxPontosFormacoes);

  let ptsRecencia = 0;
  if (formacoes > 0 && dados.diasDesdeUltimaCompra !== null) {
    const dias = Math.max(0, dados.diasDesdeUltimaCompra);
    const escalao = [...config.recencia].sort((a, b) => a.ateDias - b.ateDias).find((e) => dias <= e.ateDias);
    ptsRecencia = escalao?.pontos ?? 0;
  }

  const avaliacao = Math.min(5, Math.max(1, dados.avaliacaoEquipa ?? config.avaliacaoPorOmissao));
  const ptsAvaliacao = ((avaliacao - 1) / 4) * config.maxPontosAvaliacao;

  const ptsIntencao = dados.intencaoCompra ? config.pontosIntencaoCompra : 0;

  const atraso = Math.max(0, Math.floor(dados.parcelasEmAtraso));
  const penalizacao = Math.min(atraso * config.penalizacaoPorParcelaEmAtraso, config.maxPenalizacaoAtraso);

  const bruto = ptsFormacoes + ptsRecencia + ptsAvaliacao + ptsIntencao - penalizacao;
  const pontuacao = Math.round(Math.min(100, Math.max(0, bruto)));
  return { pontuacao, nivel: pontuacao >= config.limiarMuitoInteresse ? "MUITO" : "POUCO" };
}
