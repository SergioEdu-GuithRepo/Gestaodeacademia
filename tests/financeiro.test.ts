import { describe, expect, it } from "vitest";
import {
  calcularPagamentosFormadores,
  calcularPrevisaoCaixa,
  calcularResumoFinanceiro,
  custoSessao,
  gerarCsv,
  type DespesaInput,
  type SessaoFinanceiraInput,
} from "../src/lib/financeiro";

const sessoesExemplo: SessaoFinanceiraInput[] = [
  {
    id: "s1",
    estado: "REALIZADA",
    inicio: new Date("2026-10-05T08:00:00Z"),
    fim: new Date("2026-10-05T12:00:00Z"),
    horasLecionadas: 4,
    formadorId: "for1",
    formadorNome: "Carlos Mendes",
    formadorPrecos: {
      precoHoraComportamental: 8_000_00n,
      precoHoraTecnica: 12_000_00n,
    },
    formacaoId: "f1",
    formacaoNome: "Excel Avançado",
    formacaoCategoria: "TECNICA",
    turmaId: "t1",
    turmaCodigo: "EXC-01",
    overridePrecoHora: null,
  },
  {
    id: "s2",
    estado: "REALIZADA",
    inicio: new Date("2026-10-12T08:00:00Z"),
    fim: new Date("2026-10-12T10:30:00Z"),
    horasLecionadas: null, // usa 2.5h da duração
    formadorId: "for1",
    formadorNome: "Carlos Mendes",
    formadorPrecos: {
      precoHoraComportamental: 8_000_00n,
      precoHoraTecnica: 12_000_00n,
    },
    formacaoId: "f1",
    formacaoNome: "Excel Avançado",
    formacaoCategoria: "TECNICA",
    turmaId: "t1",
    turmaCodigo: "EXC-01",
    overridePrecoHora: null,
  },
];

describe("Gestão Financeira Operacional (Fase 3)", () => {
  it("calcula custo de uma sessão em cêntimos AOA", () => {
    // 4h * 12.000 Kz = 48.000 Kz
    expect(custoSessao(sessoesExemplo[0], 12_000_00n)).toBe(48_000_00n);
    // 2.5h * 12.000 Kz = 30.000 Kz
    expect(custoSessao(sessoesExemplo[1], 12_000_00n)).toBe(30_000_00n);
  });

  it("apura pagamentos a formadores pelas horas lecionadas vs. já pago", () => {
    const despesas: DespesaInput[] = [
      {
        id: "d1",
        categoria: "FORMADOR",
        valor: 30_000_00n,
        data: new Date("2026-10-15T00:00:00Z"),
        formadorId: "for1",
      },
    ];

    const res = calcularPagamentosFormadores(sessoesExemplo, despesas);
    expect(res).toHaveLength(1);
    expect(res[0].horasLecionadas).toBe(6.5);
    expect(res[0].valorDevido).toBe(78_000_00n);
    expect(res[0].valorPago).toBe(30_000_00n);
    expect(res[0].emFalta).toBe(48_000_00n);
  });

  it("calcula entradas, saídas, sobra operacional e rentabilidade por formação", () => {
    const despesas: DespesaInput[] = [
      {
        id: "d1",
        categoria: "FORMADOR",
        valor: 78_000_00n,
        data: new Date("2026-10-15T00:00:00Z"),
        formadorId: "for1",
        formacaoId: "f1",
      },
      {
        id: "d2",
        categoria: "CONSUMIVEIS",
        valor: 15_000_00n,
        data: new Date("2026-10-16T00:00:00Z"),
        formacaoId: "f1",
      },
      {
        id: "d3",
        categoria: "INSTALACOES",
        valor: 50_000_00n,
        data: new Date("2026-10-01T00:00:00Z"),
      },
    ];

    const resumo = calcularResumoFinanceiro({
      formacoes: [{ id: "f1", nome: "Excel Avançado" }],
      matriculas: [{ formacaoId: "f1", valorTotal: 300_000_00n, estado: "ATIVA" }],
      pagamentos: [{ formacaoId: "f1", valor: 250_000_00n }],
      despesas,
      sessoesRealizadas: sessoesExemplo,
    });

    expect(resumo.totalEntradas).toBe(250_000_00n);
    expect(resumo.totalSaidas).toBe(143_000_00n);
    expect(resumo.sobraOperacional).toBe(107_000_00n);
    expect(resumo.porFormacao[0].receitaRecebida).toBe(250_000_00n);
    expect(resumo.porFormacao[0].custoFormadores).toBe(78_000_00n);
    expect(resumo.porFormacao[0].despesasDiretas).toBe(15_000_00n);
    expect(resumo.porFormacao[0].margem).toBe(157_000_00n);
  });

  it("calcula previsão de caixa para 30, 60 e 90 dias", () => {
    const hoje = new Date("2026-10-01T00:00:00Z");
    const janelas = calcularPrevisaoCaixa({
      hoje,
      parcelasAbertas: [
        { vencimento: new Date("2026-10-15T00:00:00Z"), emFalta: 40_000_00n },
        { vencimento: new Date("2026-11-15T00:00:00Z"), emFalta: 60_000_00n },
        { vencimento: new Date("2026-12-15T00:00:00Z"), emFalta: 50_000_00n },
      ],
      sessoesAgendadas: [
        {
          ...sessoesExemplo[0],
          id: "sa1",
          estado: "AGENDADA",
          inicio: new Date("2026-10-20T08:00:00Z"),
          fim: new Date("2026-10-20T12:00:00Z"),
        },
      ],
    });

    expect(janelas).toHaveLength(3);
    // 30 dias: 40k entradas - 48k formador = -8k
    expect(janelas[0].entradasPrevistas).toBe(40_000_00n);
    expect(janelas[0].saidasFormadoresPrevistas).toBe(48_000_00n);
    expect(janelas[0].saldoProjetado).toBe(-8_000_00n);
    // 60 dias: 100k entradas - 48k = 52k
    expect(janelas[1].entradasPrevistas).toBe(100_000_00n);
    expect(janelas[1].saldoProjetado).toBe(52_000_00n);
    // 90 dias: 150k entradas - 48k = 102k
    expect(janelas[2].entradasPrevistas).toBe(150_000_00n);
    expect(janelas[2].saldoProjetado).toBe(102_000_00n);
  });

  it("gera CSV com BOM UTF-8 e separador ponto e vírgula", () => {
    const csv = gerarCsv(["Descrição", "Valor"], [["Renda; sala", "50000"], ['Material "A"', "15000"]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Renda; sala";50000');
    expect(csv).toContain('"Material ""A""";15000');
  });
});
