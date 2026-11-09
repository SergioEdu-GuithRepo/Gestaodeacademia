import { describe, expect, it } from "vitest";
import {
  calcularDescontoFidelizacao,
  calcularDescontoPontos,
  calcularExpiracaoPontos,
  calcularSaldoPontos,
  campanhaVigenteNaData,
  consolidarDescontosMatricula,
  validarCampanhaSazonal,
  validarOrcamentoCampanha,
} from "../src/lib/retencao";

describe("Retenção, Fidelização, Pontos e Campanhas (Fase 3)", () => {
  it("calcula saldo de pontos FIFO respeitando validade e resgates", () => {
    const agora = new Date("2026-06-15T10:00:00Z");
    const movimentos = [
      // Ganhou 5 pontos em Jan 2025 que expiraram em Jan 2026
      {
        pontos: 5,
        createdAt: new Date("2025-01-10T10:00:00Z"),
        expiraEm: new Date("2026-01-10T10:00:00Z"),
      },
      // Ganhou 5 pontos em Mar 2026 válidos até Mar 2027
      {
        pontos: 5,
        createdAt: new Date("2026-03-01T10:00:00Z"),
        expiraEm: new Date("2027-03-01T10:00:00Z"),
      },
      // Ganhou 5 pontos em Mai 2026 válidos até Mai 2027
      {
        pontos: 5,
        createdAt: new Date("2026-05-01T10:00:00Z"),
        expiraEm: new Date("2027-05-01T10:00:00Z"),
      },
      // Resgatou 3 pontos (abate no lote mais antigo primeiro)
      {
        pontos: -3,
        createdAt: new Date("2025-06-01T10:00:00Z"),
      },
    ];

    const res = calcularSaldoPontos(movimentos, agora);
    expect(res.totalGanhos).toBe(15);
    expect(res.totalResgatados).toBe(3);
    // O primeiro lote de 5 teve 3 resgatados em 2025, sobraram 2 que expiraram em Jan 2026
    expect(res.totalExpirados).toBe(2);
    // Os 2 lotes de 2026 (5 + 5 = 10) estão disponíveis
    expect(res.saldoDisponivel).toBe(10);
  });

  it("calcula expiração de pontos em meses", () => {
    const base = new Date("2026-02-10T00:00:00Z");
    const exp = calcularExpiracaoPontos(base, 12);
    expect(exp?.toISOString().slice(0, 10)).toBe("2027-02-10");
    expect(calcularExpiracaoPontos(base, 0)).toBeNull();
  });

  it("calcula desconto por pontos respeitando o saldo e o limite máximo", () => {
    const precoBase = 100_000_00n; // 100.000 Kz
    const r = calcularDescontoPontos({
      precoBase,
      saldoPontos: 25,
      pontosSolicitados: 25,
      percentagemPorPonto: 1,
      limiteDescontoIndicacaoPct: 20,
    });
    expect(r.pontosUsados).toBe(20);
    expect(r.percentagem).toBe(20);
    expect(r.valorDesconto).toBe(20_000_00n);
  });

  it("aplica desconto de fidelização de 5% apenas quando já fez pelo menos 1 formação", () => {
    const precoBase = 80_000_00n;
    const novo = calcularDescontoFidelizacao({
      precoBase,
      formacoesAnteriores: 0,
      descontoFidelizacaoPct: 5,
    });
    expect(novo.elegivel).toBe(false);
    expect(novo.valorDesconto).toBe(0n);

    const recorrente = calcularDescontoFidelizacao({
      precoBase,
      formacoesAnteriores: 2,
      descontoFidelizacaoPct: 5,
    });
    expect(recorrente.elegivel).toBe(true);
    expect(recorrente.percentagem).toBe(5);
    expect(recorrente.valorDesconto).toBe(4_000_00n);
  });

  it("valida campanha sazonal (máximo 20% e mês/ano obrigatórios)", () => {
    expect(
      validarCampanhaSazonal({
        tipo: "SAZONAL",
        descontoPct: 25,
        mesValidade: 10,
        anoValidade: 2026,
      }).ok,
    ).toBe(false);

    expect(
      validarCampanhaSazonal({
        tipo: "SAZONAL",
        descontoPct: 15,
        mesValidade: null,
        anoValidade: 2026,
      }).ok,
    ).toBe(false);

    expect(
      validarCampanhaSazonal({
        tipo: "SAZONAL",
        descontoPct: 20,
        mesValidade: 10,
        anoValidade: 2026,
      }).ok,
    ).toBe(true);
  });

  it("verifica se campanha sazonal está vigente apenas no mês e ano definidos", () => {
    const campOutubro = {
      estado: "ATIVA" as const,
      tipo: "SAZONAL" as const,
      mesValidade: 10,
      anoValidade: 2026,
      formacaoId: "f1",
    };

    expect(campanhaVigenteNaData(campOutubro, new Date("2026-10-18T12:00:00Z"), "f1")).toBe(true);
    expect(campanhaVigenteNaData(campOutubro, new Date("2026-11-01T12:00:00Z"), "f1")).toBe(false);
    expect(campanhaVigenteNaData(campOutubro, new Date("2026-10-18T12:00:00Z"), "f2")).toBe(false);
  });

  it("valida orçamento da campanha contra a sobra operacional disponível", () => {
    const cabe = validarOrcamentoCampanha({
      orcamentoMax: 50_000_00n,
      descontojaConsumido: 10_000_00n,
      novoDesconto: 15_000_00n,
      sobraOperacionalDisponivel: 120_000_00n,
    });
    expect(cabe.cabeNoOrcamentoCampanha).toBe(true);
    expect(cabe.cabeNaSobraOperacional).toBe(true);
    expect(cabe.aviso).toBeNull();

    const excedeSobra = validarOrcamentoCampanha({
      orcamentoMax: 200_000_00n,
      sobraOperacionalDisponivel: 80_000_00n,
    });
    expect(excedeSobra.cabeNaSobraOperacional).toBe(false);
    expect(excedeSobra.aviso).toContain("sobra operacional");
  });

  it("consolida descontos sem ultrapassar o preço base da formação", () => {
    const res = consolidarDescontosMatricula({
      precoBase: 50_000_00n,
      descontoFidelizacao: 2_500_00n,
      descontoCampanha: 10_000_00n,
      descontoPontos: 5_000_00n,
      descontoManual: 1_000_00n,
    });
    expect(res.descontoTotal).toBe(18_500_00n);
    expect(res.valorFinal).toBe(31_500_00n);
  });
});
