/**
 * Regras de negócio da Fase 3 — Retenção, Fidelização, Programa de Indicação e Campanhas (secção 4.4 e 4.7).
 *
 * Funções puras (sem acesso direto à BD) para facilitar testes unitários e
 * reutilização entre formulários, Server Actions e validações.
 */

export type RegrasRetencao = {
  descontoFidelizacaoPct: number;
  pontosPorIndicacao: number;
  percentagemPorPonto: number;
  limiteDescontoIndicacaoPct: number;
  validadePontosMeses: number;
};

export const REGRAS_RETENCAO_PADRAO: RegrasRetencao = {
  descontoFidelizacaoPct: 5,
  pontosPorIndicacao: 5,
  percentagemPorPonto: 1,
  limiteDescontoIndicacaoPct: 20,
  validadePontosMeses: 12,
};

export type MovimentoPontosInput = {
  pontos: number;
  createdAt: Date;
  expiraEm?: Date | null;
};

/**
 * Calcula o saldo de pontos disponíveis de um formando numa determinada data (`agora`),
 * abatendo os resgates (pontos negativos) aos ganhos mais antigos ainda válidos (FIFO)
 * e ignorando os ganhos cujo prazo de validade (`expiraEm`) já expirou.
 */
export function calcularSaldoPontos(
  movimentos: readonly MovimentoPontosInput[],
  agora: Date = new Date(),
): {
  saldoDisponivel: number;
  totalGanhos: number;
  totalResgatados: number;
  totalExpirados: number;
} {
  const ordenados = [...movimentos].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  type Lote = { restante: number; expiraEm: Date | null };
  const lotes: Lote[] = [];
  let totalGanhos = 0;
  let totalResgatados = 0;

  for (const m of ordenados) {
    if (m.pontos > 0) {
      totalGanhos += m.pontos;
      lotes.push({ restante: m.pontos, expiraEm: m.expiraEm ?? null });
    } else if (m.pontos < 0) {
      let abater = Math.abs(m.pontos);
      totalResgatados += abater;
      for (const lote of lotes) {
        if (abater <= 0) break;
        if (lote.restante <= 0) continue;
        const usado = Math.min(lote.restante, abater);
        lote.restante -= usado;
        abater -= usado;
      }
    }
  }

  let saldoDisponivel = 0;
  let totalExpirados = 0;
  const tsAgora = agora.getTime();

  for (const lote of lotes) {
    if (lote.restante <= 0) continue;
    if (lote.expiraEm && lote.expiraEm.getTime() < tsAgora) {
      totalExpirados += lote.restante;
    } else {
      saldoDisponivel += lote.restante;
    }
  }

  return { saldoDisponivel, totalGanhos, totalResgatados, totalExpirados };
}

/** Calcula a data de expiração dos pontos ganhos hoje segundo `validadePontosMeses`. */
export function calcularExpiracaoPontos(base: Date, validadeMeses: number): Date | null {
  if (validadeMeses <= 0) return null;
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + validadeMeses);
  return d;
}

/**
 * Calcula quantos pontos podem ser resgatados e a percentagem/valor de desconto correspondente.
 */
export function calcularDescontoPontos(params: {
  precoBase: bigint;
  saldoPontos: number;
  pontosSolicitados: number;
  percentagemPorPonto: number;
  limiteDescontoIndicacaoPct: number;
}): {
  pontosUsados: number;
  percentagem: number;
  valorDesconto: bigint;
} {
  const { precoBase, saldoPontos, pontosSolicitados, percentagemPorPonto, limiteDescontoIndicacaoPct } = params;
  if (precoBase <= 0n || saldoPontos <= 0 || pontosSolicitados <= 0 || percentagemPorPonto <= 0) {
    return { pontosUsados: 0, percentagem: 0, valorDesconto: 0n };
  }

  const maxPontosPeloLimite = Math.floor(limiteDescontoIndicacaoPct / percentagemPorPonto);
  const pontosUsados = Math.max(0, Math.min(pontosSolicitados, saldoPontos, maxPontosPeloLimite));
  const percentagem = Math.min(limiteDescontoIndicacaoPct, pontosUsados * percentagemPorPonto);
  const valorDesconto = (precoBase * BigInt(percentagem)) / 100n;

  return { pontosUsados, percentagem, valorDesconto };
}

/**
 * Calcula o desconto de fidelização (padrão 5%) para formandos que já realizaram
 * pelo menos 1 formação anterior no centro.
 */
export function calcularDescontoFidelizacao(params: {
  precoBase: bigint;
  formacoesAnteriores: number;
  descontoFidelizacaoPct: number;
}): {
  elegivel: boolean;
  percentagem: number;
  valorDesconto: bigint;
} {
  const { precoBase, formacoesAnteriores, descontoFidelizacaoPct } = params;
  if (formacoesAnteriores < 1 || descontoFidelizacaoPct <= 0 || precoBase <= 0n) {
    return { elegivel: false, percentagem: 0, valorDesconto: 0n };
  }
  const pct = Math.min(100, Math.max(0, descontoFidelizacaoPct));
  return {
    elegivel: true,
    percentagem: pct,
    valorDesconto: (precoBase * BigInt(pct)) / 100n,
  };
}

/**
 * Valida uma campanha sazonal segundo as regras da secção 4.4:
 * - Desconto máximo de 20% nas campanhas sazonais;
 * - Mês de validade obrigatório (1–12) e ano de validade obrigatório;
 * - A campanha só pode ser aplicada em matrículas no mês/ano em que ocorre.
 */
export function validarCampanhaSazonal(params: {
  tipo: "SAZONAL" | "FIDELIZACAO" | "SEGMENTADA";
  descontoPct: number;
  mesValidade?: number | null;
  anoValidade?: number | null;
}): { ok: true } | { ok: false; erro: string } {
  const { tipo, descontoPct, mesValidade, anoValidade } = params;

  if (descontoPct < 0 || !Number.isInteger(descontoPct)) {
    return { ok: false, erro: "A percentagem de desconto deve ser um número inteiro não negativo." };
  }

  if (tipo === "SAZONAL") {
    if (descontoPct > 20) {
      return { ok: false, erro: "As campanhas sazonais têm o limite máximo de 20% de desconto." };
    }
    if (!mesValidade || mesValidade < 1 || mesValidade > 12) {
      return { ok: false, erro: "Indique o mês de validade (1 a 12) da campanha sazonal." };
    }
    if (!anoValidade || anoValidade < 2024 || anoValidade > 2100) {
      return { ok: false, erro: "Indique o ano de validade da campanha sazonal." };
    }
  } else if (descontoPct > 50) {
    return { ok: false, erro: "A percentagem de desconto não pode ultrapassar 50%." };
  }

  return { ok: true };
}

/**
 * Verifica se uma campanha está vigente numa determinada data (`dataReferencia`)
 * e para uma determinada formação (`formacaoId`).
 */
export function campanhaVigenteNaData(
  campanha: {
    estado: "RASCUNHO" | "ATIVA" | "ENVIADA" | "ENCERRADA";
    tipo: "SAZONAL" | "FIDELIZACAO" | "SEGMENTADA";
    mesValidade?: number | null;
    anoValidade?: number | null;
    formacaoId?: string | null;
  },
  dataReferencia: Date,
  formacaoId?: string | null,
): boolean {
  if (campanha.estado !== "ATIVA" && campanha.estado !== "ENVIADA") return false;
  if (campanha.formacaoId && formacaoId && campanha.formacaoId !== formacaoId) return false;

  if (campanha.mesValidade && campanha.anoValidade) {
    const mesAtual = dataReferencia.getUTCMonth() + 1;
    const anoAtual = dataReferencia.getUTCFullYear();
    if (campanha.mesValidade !== mesAtual || campanha.anoValidade !== anoAtual) {
      return false;
    }
  }

  return true;
}

/**
 * Valida se o orçamento de uma campanha cabe na margem / sobra operacional disponível (secção 4.7).
 */
export function validarOrcamentoCampanha(params: {
  orcamentoMax?: bigint | null;
  descontojaConsumido?: bigint;
  novoDesconto?: bigint;
  sobraOperacionalDisponivel: bigint;
}): {
  cabeNoOrcamentoCampanha: boolean;
  cabeNaSobraOperacional: boolean;
  aviso: string | null;
} {
  const {
    orcamentoMax,
    descontojaConsumido = 0n,
    novoDesconto = 0n,
    sobraOperacionalDisponivel,
  } = params;

  const totalCampanha = descontojaConsumido + novoDesconto;
  const cabeNoOrcamentoCampanha = orcamentoMax == null ? true : totalCampanha <= orcamentoMax;

  const custoAValidar = orcamentoMax ?? totalCampanha;
  const cabeNaSobraOperacional = custoAValidar <= 0n ? true : sobraOperacionalDisponivel >= custoAValidar;

  let aviso: string | null = null;
  if (!cabeNoOrcamentoCampanha) {
    aviso = "O desconto ultrapassa o orçamento máximo definido para esta campanha.";
  } else if (!cabeNaSobraOperacional) {
    aviso = "Atenção: o orçamento desta campanha é superior à sobra operacional disponível no período.";
  }

  return { cabeNoOrcamentoCampanha, cabeNaSobraOperacional, aviso };
}

/**
 * Consolida os descontos aplicáveis numa matrícula (fidelização + campanha + pontos + manual)
 * garantindo que o desconto total nunca excede o preço base da formação.
 */
export function consolidarDescontosMatricula(params: {
  precoBase: bigint;
  descontoFidelizacao: bigint;
  descontoCampanha: bigint;
  descontoPontos: bigint;
  descontoManual: bigint;
}): {
  descontoTotal: bigint;
  valorFinal: bigint;
} {
  const { precoBase, descontoFidelizacao, descontoCampanha, descontoPontos, descontoManual } = params;
  if (precoBase <= 0n) return { descontoTotal: 0n, valorFinal: 0n };
  const soma =
    (descontoFidelizacao > 0n ? descontoFidelizacao : 0n) +
    (descontoCampanha > 0n ? descontoCampanha : 0n) +
    (descontoPontos > 0n ? descontoPontos : 0n) +
    (descontoManual > 0n ? descontoManual : 0n);
  const descontoTotal = soma > precoBase ? precoBase : soma;
  return {
    descontoTotal,
    valorFinal: precoBase - descontoTotal,
  };
}

export const NOMES_MESES: Record<number, string> = {
  1: "Janeiro",
  2: "Fevereiro",
  3: "Março",
  4: "Abril",
  5: "Maio",
  6: "Junho",
  7: "Julho",
  8: "Agosto",
  9: "Setembro",
  10: "Outubro",
  11: "Novembro",
  12: "Dezembro",
};
