import { describe, expect, it } from "vitest";
import { CONFIG_INTERESSE, LIMIAR_MUITO_INTERESSE, calcularInteresse, type DadosInteresse } from "../src/lib/interesse";

const base: DadosInteresse = {
  formacoesCompradas: 0,
  diasDesdeUltimaCompra: null,
  parcelasEmAtraso: 0,
  avaliacaoEquipa: null,
  intencaoCompra: false,
};

describe("calcularInteresse", () => {
  it("formando novo sem dados tem pouco interesse (só a avaliação neutra conta)", () => {
    const r = calcularInteresse(base);
    expect(r.pontuacao).toBe(13); // (3-1)/4 × 25 = 12,5 → 13
    expect(r.nivel).toBe("POUCO");
  });

  it("intenção de comprar + boa avaliação chega a muito interesse mesmo sem compras", () => {
    const r = calcularInteresse({ ...base, intencaoCompra: true, avaliacaoEquipa: 5 });
    expect(r.pontuacao).toBe(50);
    expect(r.nivel).toBe("MUITO");
  });

  it("cliente recorrente e recente tem muito interesse", () => {
    const r = calcularInteresse({ ...base, formacoesCompradas: 2, diasDesdeUltimaCompra: 30, avaliacaoEquipa: 4 });
    // 20 + 20 + 18,75 = 58,75 → 59
    expect(r.pontuacao).toBe(59);
    expect(r.nivel).toBe("MUITO");
  });

  it("limita os pontos das formações a partir de 3", () => {
    const tres = calcularInteresse({ ...base, formacoesCompradas: 3 });
    const dez = calcularInteresse({ ...base, formacoesCompradas: 10 });
    expect(dez.pontuacao).toBe(tres.pontuacao);
  });

  it("a recência decresce por escalões", () => {
    const p = (dias: number) =>
      calcularInteresse({ ...base, formacoesCompradas: 1, diasDesdeUltimaCompra: dias }).pontuacao;
    expect(p(0)).toBeGreaterThan(p(120));
    expect(p(120)).toBeGreaterThan(p(300));
    expect(p(300)).toBeGreaterThan(p(400));
    expect(p(90)).toBe(p(0));
  });

  it("ignora recência se não comprou nada", () => {
    expect(calcularInteresse({ ...base, diasDesdeUltimaCompra: 5 }).pontuacao).toBe(calcularInteresse(base).pontuacao);
  });

  it("parcelas em atraso penalizam, com limite", () => {
    const sem = calcularInteresse({ ...base, formacoesCompradas: 3, diasDesdeUltimaCompra: 10, intencaoCompra: true });
    const uma = calcularInteresse({ ...base, formacoesCompradas: 3, diasDesdeUltimaCompra: 10, intencaoCompra: true, parcelasEmAtraso: 1 });
    const cinco = calcularInteresse({ ...base, formacoesCompradas: 3, diasDesdeUltimaCompra: 10, intencaoCompra: true, parcelasEmAtraso: 5 });
    expect(sem.pontuacao - uma.pontuacao).toBe(10);
    expect(sem.pontuacao - cinco.pontuacao).toBe(CONFIG_INTERESSE.maxPenalizacaoAtraso);
  });

  it("a pontuação fica sempre entre 0 e 100", () => {
    const max = calcularInteresse({
      formacoesCompradas: 99,
      diasDesdeUltimaCompra: 0,
      parcelasEmAtraso: 0,
      avaliacaoEquipa: 5,
      intencaoCompra: true,
    });
    expect(max.pontuacao).toBe(100);
    const min = calcularInteresse({ ...base, avaliacaoEquipa: 1, parcelasEmAtraso: 9 });
    expect(min.pontuacao).toBe(0);
    expect(min.nivel).toBe("POUCO");
  });

  it("o limiar é inclusivo e configurável", () => {
    expect(LIMIAR_MUITO_INTERESSE).toBe(50);
    const dados = { ...base, formacoesCompradas: 1, diasDesdeUltimaCompra: 10 }; // 10 + 20 + 12,5 → 43
    expect(calcularInteresse(dados).nivel).toBe("POUCO");
    expect(calcularInteresse(dados, { ...CONFIG_INTERESSE, limiarMuitoInteresse: 43 }).nivel).toBe("MUITO");
  });
});
