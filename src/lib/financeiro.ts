import type { CategoriaDespesa, CategoriaFormacao } from "@prisma/client";
import { horasSessao, precoHoraFormador, type PrecosCategoria, type SessaoHoras } from "./precos-formador";

/**
 * Gestão financeira operacional, apuramento de pagamentos a formadores,
 * rentabilidade por formação, previsão de caixa (30/60/90 dias) e exportação CSV (secção 4.7).
 */

export const NOMES_CATEGORIA_DESPESA: Record<CategoriaDespesa, string> = {
  FORMADOR: "Pagamento a formadores",
  SALARIOS: "Salários (equipa interna)",
  CONSUMIVEIS: "Consumíveis por formação",
  MANUTENCAO: "Manutenção",
  INSTALACOES: "Instalações (renda, água, luz, internet)",
  MARKETING: "Marketing e campanhas",
  OUTROS: "Outras despesas",
};

export const CATEGORIAS_DESPESA = Object.keys(NOMES_CATEGORIA_DESPESA) as CategoriaDespesa[];

/** Calcula o custo em cêntimos AOA de uma sessão dado o valor/hora em cêntimos. */
export function custoSessao(sessao: SessaoHoras, precoHora: bigint | null): bigint {
  if (!precoHora || precoHora <= 0n) return 0n;
  const centesimosHora = BigInt(Math.round(horasSessao(sessao) * 100));
  if (centesimosHora <= 0n) return 0n;
  return (centesimosHora * precoHora) / 100n;
}

export type SessaoFinanceiraInput = SessaoHoras & {
  id: string;
  estado: "AGENDADA" | "REALIZADA" | "CANCELADA";
  formadorId: string;
  formadorNome: string;
  formadorPrecos: PrecosCategoria;
  formacaoId: string;
  formacaoNome: string;
  formacaoCategoria: CategoriaFormacao;
  turmaId: string;
  turmaCodigo: string;
  overridePrecoHora?: bigint | null;
};

export type DespesaInput = {
  id: string;
  categoria: CategoriaDespesa;
  valor: bigint;
  data: Date;
  formacaoId?: string | null;
  turmaId?: string | null;
  formadorId?: string | null;
  horasPagas?: number | null;
};

export type ResumoFormadorPagamento = {
  formadorId: string;
  formadorNome: string;
  sessoesRealizadas: number;
  horasLecionadas: number;
  valorDevido: bigint;
  valorPago: bigint;
  emFalta: bigint;
};

/**
 * Calcula quanto cada formador tem a receber pelas horas lecionadas (sessões REALIZADA)
 * face aos pagamentos já registados como despesa na categoria FORMADOR.
 */
export function calcularPagamentosFormadores(
  sessoes: readonly SessaoFinanceiraInput[],
  despesas: readonly DespesaInput[],
): ResumoFormadorPagamento[] {
  const mapa = new Map<
    string,
    {
      formadorId: string;
      formadorNome: string;
      sessoesRealizadas: number;
      centesimosHora: number;
      valorDevido: bigint;
      valorPago: bigint;
    }
  >();

  for (const s of sessoes) {
    if (s.estado !== "REALIZADA") continue;
    const atual = mapa.get(s.formadorId) ?? {
      formadorId: s.formadorId,
      formadorNome: s.formadorNome,
      sessoesRealizadas: 0,
      centesimosHora: 0,
      valorDevido: 0n,
      valorPago: 0n,
    };
    const h = horasSessao(s);
    const ph = precoHoraFormador(s.formadorPrecos, s.formacaoCategoria, s.overridePrecoHora);
    atual.sessoesRealizadas += 1;
    atual.centesimosHora += Math.round(h * 100);
    atual.valorDevido += custoSessao(s, ph);
    mapa.set(s.formadorId, atual);
  }

  for (const d of despesas) {
    if (d.categoria !== "FORMADOR" || !d.formadorId) continue;
    const atual = mapa.get(d.formadorId);
    if (atual) {
      atual.valorPago += d.valor;
    } else {
      mapa.set(d.formadorId, {
        formadorId: d.formadorId,
        formadorNome: "Formador",
        sessoesRealizadas: 0,
        centesimosHora: 0,
        valorDevido: 0n,
        valorPago: d.valor,
      });
    }
  }

  return Array.from(mapa.values())
    .map((item) => ({
      formadorId: item.formadorId,
      formadorNome: item.formadorNome,
      sessoesRealizadas: item.sessoesRealizadas,
      horasLecionadas: item.centesimosHora / 100,
      valorDevido: item.valorDevido,
      valorPago: item.valorPago,
      emFalta: item.valorDevido > item.valorPago ? item.valorDevido - item.valorPago : 0n,
    }))
    .sort((a, b) => (b.emFalta > a.emFalta ? 1 : b.emFalta < a.emFalta ? -1 : a.formadorNome.localeCompare(b.formadorNome)));
}

export type RentabilidadeFormacao = {
  formacaoId: string;
  formacaoNome: string;
  matriculasAtivas: number;
  valorContratado: bigint;
  receitaRecebida: bigint;
  custoFormadores: bigint;
  despesasDiretas: bigint;
  custoTotal: bigint;
  margem: bigint;
};

/**
 * Calcula o resumo financeiro operacional do período (entradas, saídas por categoria,
 * sobra operacional e rentabilidade por formação).
 */
export function calcularResumoFinanceiro(params: {
  formacoes: readonly { id: string; nome: string }[];
  matriculas: readonly { formacaoId: string; valorTotal: bigint; estado: string }[];
  pagamentos: readonly { formacaoId: string; valor: bigint }[];
  despesas: readonly DespesaInput[];
  sessoesRealizadas: readonly SessaoFinanceiraInput[];
}): {
  totalEntradas: bigint;
  totalSaidas: bigint;
  sobraOperacional: bigint;
  porCategoria: Record<CategoriaDespesa, bigint>;
  porFormacao: RentabilidadeFormacao[];
} {
  const { formacoes, matriculas, pagamentos, despesas, sessoesRealizadas } = params;

  let totalEntradas = 0n;
  for (const p of pagamentos) {
    totalEntradas += p.valor;
  }

  const porCategoria: Record<CategoriaDespesa, bigint> = {
    FORMADOR: 0n,
    SALARIOS: 0n,
    CONSUMIVEIS: 0n,
    MANUTENCAO: 0n,
    INSTALACOES: 0n,
    MARKETING: 0n,
    OUTROS: 0n,
  };

  let totalSaidas = 0n;
  for (const d of despesas) {
    porCategoria[d.categoria] = (porCategoria[d.categoria] ?? 0n) + d.valor;
    totalSaidas += d.valor;
  }

  const sobraOperacional = totalEntradas - totalSaidas;

  const mapaFormacao = new Map<string, RentabilidadeFormacao>();
  for (const f of formacoes) {
    mapaFormacao.set(f.id, {
      formacaoId: f.id,
      formacaoNome: f.nome,
      matriculasAtivas: 0,
      valorContratado: 0n,
      receitaRecebida: 0n,
      custoFormadores: 0n,
      despesasDiretas: 0n,
      custoTotal: 0n,
      margem: 0n,
    });
  }

  for (const m of matriculas) {
    if (m.estado === "CANCELADA") continue;
    const f = mapaFormacao.get(m.formacaoId);
    if (!f) continue;
    f.matriculasAtivas += 1;
    f.valorContratado += m.valorTotal;
  }

  for (const p of pagamentos) {
    const f = mapaFormacao.get(p.formacaoId);
    if (!f) continue;
    f.receitaRecebida += p.valor;
  }

  for (const s of sessoesRealizadas) {
    if (s.estado !== "REALIZADA") continue;
    const f = mapaFormacao.get(s.formacaoId);
    if (!f) continue;
    const ph = precoHoraFormador(s.formadorPrecos, s.formacaoCategoria, s.overridePrecoHora);
    f.custoFormadores += custoSessao(s, ph);
  }

  for (const d of despesas) {
    if (!d.formacaoId || d.categoria === "FORMADOR") continue;
    const f = mapaFormacao.get(d.formacaoId);
    if (!f) continue;
    f.despesasDiretas += d.valor;
  }

  const porFormacao = Array.from(mapaFormacao.values())
    .map((f) => {
      const custoTotal = f.custoFormadores + f.despesasDiretas;
      return {
        ...f,
        custoTotal,
        margem: f.receitaRecebida - custoTotal,
      };
    })
    .sort((a, b) => (b.margem > a.margem ? 1 : b.margem < a.margem ? -1 : a.formacaoNome.localeCompare(b.formacaoNome)));

  return {
    totalEntradas,
    totalSaidas,
    sobraOperacional,
    porCategoria,
    porFormacao,
  };
}

export type JanelaPrevisaoCaixa = {
  dias: 30 | 60 | 90;
  entradasPrevistas: bigint;
  saidasFormadoresPrevistas: bigint;
  saldoProjetado: bigint;
  numParcelas: number;
  numSessoes: number;
};

/**
 * Calcula a previsão de caixa para os próximos 30, 60 e 90 dias a partir de `hoje`:
 * - Entradas previstas: valor em falta de parcelas não canceladas com vencimento entre `hoje` e `hoje + N dias`;
 * - Saídas previstas: custo estimado de sessões AGENDADA entre `hoje` e `hoje + N dias`.
 */
export function calcularPrevisaoCaixa(params: {
  hoje: Date;
  parcelasAbertas: readonly { vencimento: Date; emFalta: bigint }[];
  sessoesAgendadas: readonly SessaoFinanceiraInput[];
}): JanelaPrevisaoCaixa[] {
  const { hoje, parcelasAbertas, sessoesAgendadas } = params;
  const inicioMs = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const janelas: (30 | 60 | 90)[] = [30, 60, 90];

  return janelas.map((dias) => {
    const limiteMs = inicioMs + dias * 86_400_000;
    let entradasPrevistas = 0n;
    let numParcelas = 0;

    for (const p of parcelasAbertas) {
      if (p.emFalta <= 0n) continue;
      const vMs = p.vencimento.getTime();
      if (vMs >= inicioMs && vMs <= limiteMs) {
        entradasPrevistas += p.emFalta;
        numParcelas += 1;
      }
    }

    let saidasFormadoresPrevistas = 0n;
    let numSessoes = 0;
    for (const s of sessoesAgendadas) {
      if (s.estado !== "AGENDADA") continue;
      const sMs = s.inicio.getTime();
      if (sMs >= inicioMs && sMs <= limiteMs) {
        const ph = precoHoraFormador(s.formadorPrecos, s.formacaoCategoria, s.overridePrecoHora);
        saidasFormadoresPrevistas += custoSessao(s, ph);
        numSessoes += 1;
      }
    }

    return {
      dias,
      entradasPrevistas,
      saidasFormadoresPrevistas,
      saldoProjetado: entradasPrevistas - saidasFormadoresPrevistas,
      numParcelas,
      numSessoes,
    };
  });
}

function escaparCelulaCsv(valor: string | number | bigint | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (/[";\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Gera conteúdo CSV com BOM UTF-8 (\uFEFF) e separador `;` (compatível com Excel PT/AO).
 */
export function gerarCsv(
  cabecalhos: readonly string[],
  linhas: readonly (readonly (string | number | bigint | null | undefined)[])[],
): string {
  const todas = [cabecalhos, ...linhas].map((linha) => linha.map(escaparCelulaCsv).join(";"));
  return `\uFEFF${todas.join("\r\n")}\r\n`;
}
