import { describe, expect, it } from "vitest";
import { formatHoras, horasSessao, precoHoraFormador, totalHoras } from "../src/lib/precos-formador";
import { mediaAvaliacao, mediasAvaliacoes } from "../src/lib/avaliacoes";
import { slugify } from "../src/lib/catalogo";

describe("precoHoraFormador", () => {
  const f = { precoHoraComportamental: 1_500_000n, precoHoraTecnica: 2_000_000n };

  it("usa o preço da categoria", () => {
    expect(precoHoraFormador(f, "COMPORTAMENTAL")).toBe(1_500_000n);
    expect(precoHoraFormador(f, "TECNICA")).toBe(2_000_000n);
  });

  it("a sobreposição da formação tem prioridade", () => {
    expect(precoHoraFormador(f, "TECNICA", 2_200_000n)).toBe(2_200_000n);
    expect(precoHoraFormador(f, "COMPORTAMENTAL", 0n)).toBe(0n);
  });

  it("ignora sobreposição nula/indefinida", () => {
    expect(precoHoraFormador(f, "TECNICA", null)).toBe(2_000_000n);
    expect(precoHoraFormador(f, "TECNICA", undefined)).toBe(2_000_000n);
  });

  it("devolve null quando não há preço definido", () => {
    const semPrecos = { precoHoraComportamental: null, precoHoraTecnica: null };
    expect(precoHoraFormador(semPrecos, "TECNICA")).toBeNull();
    expect(precoHoraFormador({ precoHoraComportamental: 100n, precoHoraTecnica: null }, "TECNICA")).toBeNull();
  });
});

describe("horas lecionadas", () => {
  const inicio = new Date("2026-10-20T17:00:00Z");
  const fim = new Date("2026-10-20T20:00:00Z");

  it("usa horasLecionadas quando definidas, senão a duração", () => {
    expect(horasSessao({ inicio, fim, horasLecionadas: null })).toBe(3);
    expect(horasSessao({ inicio, fim, horasLecionadas: { toString: () => "2.5" } })).toBe(2.5);
    expect(horasSessao({ inicio, fim, horasLecionadas: 0 })).toBe(0);
  });

  it("soma e formata", () => {
    const total = totalHoras([
      { inicio, fim, horasLecionadas: null },
      { inicio, fim, horasLecionadas: { toString: () => "1.25" } },
    ]);
    expect(total).toBe(4.25);
    expect(formatHoras(total)).toBe("4,25 h");
  });
});

describe("avaliações", () => {
  const a = { dominioConteudo: 5, eticaProfissional: 5, cumprimentoHorarios: 4, enquadramentoExercicios: 5, capacidadeMotivar: 5 };
  const b = { dominioConteudo: 3, eticaProfissional: 4, cumprimentoHorarios: 4, enquadramentoExercicios: 3, capacidadeMotivar: 4 };

  it("calcula médias", () => {
    expect(mediaAvaliacao(a)).toBe(4.8);
    const m = mediasAvaliacoes([a, b]);
    expect(m.total).toBe(2);
    expect(m.porCriterio.dominioConteudo).toBe(4);
    expect(m.porCriterio.cumprimentoHorarios).toBe(4);
    expect(m.geral).toBe(4.2);
    expect(mediasAvaliacoes([]).geral).toBeNull();
  });
});

describe("slugify", () => {
  it("remove acentos e símbolos", () => {
    expect(slugify("Gestão de Projetos (Nível I)")).toBe("gestao-de-projetos-nivel-i");
    expect(slugify("  Excel — Avançado!  ")).toBe("excel-avancado");
  });
});
