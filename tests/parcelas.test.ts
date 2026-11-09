import { describe, expect, it } from "vitest";
import { dataSimples } from "@/lib/datas";
import { alocarPagamento, estadoParcela, gerarParcelas, resumirParcelas } from "@/lib/parcelas";

describe("gerarParcelas", () => {
  it("divide igualmente e põe o resto na 1.ª parcela", () => {
    const p = gerarParcelas(10_000_001n, 3, dataSimples("2026-10-18"));
    expect(p.map((x) => x.valor)).toEqual([3_333_335n, 3_333_333n, 3_333_333n]);
    expect(p.reduce((s, x) => s + x.valor, 0n)).toBe(10_000_001n);
  });

  it("1.ª parcela na inscrição, seguintes mensais", () => {
    const p = gerarParcelas(300n, 3, dataSimples("2026-01-31"));
    expect(p.map((x) => x.vencimento.toISOString().slice(0, 10))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("à vista = 1 parcela", () => {
    expect(gerarParcelas(15_000_000n, 1, dataSimples("2026-10-18"))).toHaveLength(1);
  });

  it("rejeita valores inválidos", () => {
    expect(() => gerarParcelas(0n, 3, new Date())).toThrow();
    expect(() => gerarParcelas(100n, 0, new Date())).toThrow();
  });
});

describe("alocarPagamento", () => {
  const parcelas = [
    { id: "p1", numero: 1, valor: 1000n, pago: 1000n },
    { id: "p2", numero: 2, valor: 1000n, pago: 300n },
    { id: "p3", numero: 3, valor: 1000n, pago: 0n },
  ];

  it("abate da mais antiga para a mais recente", () => {
    expect(alocarPagamento(1200n, parcelas)).toEqual([
      { parcelaId: "p2", valor: 700n },
      { parcelaId: "p3", valor: 500n },
    ]);
  });

  it("pagamento parcial de uma parcela", () => {
    expect(alocarPagamento(100n, parcelas)).toEqual([{ parcelaId: "p2", valor: 100n }]);
  });

  it("liquida a dívida exata", () => {
    const a = alocarPagamento(1700n, parcelas);
    expect(a.reduce((s, x) => s + x.valor, 0n)).toBe(1700n);
  });

  it("rejeita pagamento acima da dívida ou não positivo", () => {
    expect(() => alocarPagamento(1701n, parcelas)).toThrow(/excede/);
    expect(() => alocarPagamento(0n, parcelas)).toThrow();
  });
});

describe("estado e resumo", () => {
  const hoje = dataSimples("2026-10-18");
  it("classifica parcelas", () => {
    expect(estadoParcela({ valor: 100n, pago: 100n, vencimento: dataSimples("2026-01-01") }, hoje)).toBe("PAGA");
    expect(estadoParcela({ valor: 100n, pago: 50n, vencimento: dataSimples("2026-10-17") }, hoje)).toBe("EM_ATRASO");
    expect(estadoParcela({ valor: 100n, pago: 50n, vencimento: dataSimples("2026-10-18") }, hoje)).toBe("PARCIAL");
    expect(estadoParcela({ valor: 100n, pago: 0n, vencimento: dataSimples("2026-11-18") }, hoje)).toBe("PENDENTE");
  });

  it("resume dívida e parcelas em falta", () => {
    const r = resumirParcelas(
      [
        { valor: 100n, pago: 100n, vencimento: dataSimples("2026-09-18") },
        { valor: 100n, pago: 20n, vencimento: dataSimples("2026-10-01") },
        { valor: 100n, pago: 0n, vencimento: dataSimples("2026-11-18") },
      ],
      hoje,
    );
    expect(r).toEqual({ total: 300n, pago: 120n, divida: 180n, parcelasEmFalta: 2, parcelasEmAtraso: 1 });
  });
});
