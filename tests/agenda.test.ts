import { describe, expect, it } from "vitest";
import { classificarConflitos, sobrepoe, validarIntervalo } from "@/lib/agenda";
import { instanteLocal } from "@/lib/datas";

const h = (hora: string, dia = "2026-10-20") => instanteLocal(dia, hora);

describe("instanteLocal (Africa/Luanda, UTC+1)", () => {
  it("converte hora local para UTC", () => {
    expect(instanteLocal("2026-10-20", "18:00").toISOString()).toBe("2026-10-20T17:00:00.000Z");
  });
});

describe("sobrepoe (intervalos semi-abertos)", () => {
  it("deteta sobreposição parcial e total", () => {
    expect(sobrepoe({ inicio: h("10:00"), fim: h("12:00") }, { inicio: h("11:00"), fim: h("13:00") })).toBe(true);
    expect(sobrepoe({ inicio: h("10:00"), fim: h("14:00") }, { inicio: h("11:00"), fim: h("12:00") })).toBe(true);
  });
  it("sessões encostadas não colidem", () => {
    expect(sobrepoe({ inicio: h("10:00"), fim: h("12:00") }, { inicio: h("12:00"), fim: h("14:00") })).toBe(false);
  });
  it("dias diferentes não colidem", () => {
    expect(sobrepoe({ inicio: h("10:00"), fim: h("12:00") }, { inicio: h("10:00", "2026-10-21"), fim: h("12:00", "2026-10-21") })).toBe(false);
  });
});

describe("validarIntervalo", () => {
  it("rejeita fim antes do início e durações excessivas", () => {
    expect(validarIntervalo({ inicio: h("12:00"), fim: h("10:00") })).toMatch(/posterior/);
    expect(validarIntervalo({ inicio: h("12:00"), fim: h("12:00") })).toMatch(/posterior/);
    expect(validarIntervalo({ inicio: h("06:00"), fim: h("19:00") })).toMatch(/12 horas/);
    expect(validarIntervalo({ inicio: h("18:00"), fim: h("21:00") })).toBeNull();
  });
});

describe("classificarConflitos", () => {
  const existente = {
    id: "s1",
    turmaId: "T1",
    formadorId: "F1",
    salaId: "S1",
    inicio: h("18:00"),
    fim: h("21:00"),
    turma: { codigo: "LID-01", formacao: { nome: "Liderança" } },
    formador: { nome: "Manuel" },
    sala: { nome: "Sala 1" },
  };

  it("identifica cada tipo de conflito", () => {
    const tipos = (nova: Partial<typeof existente>) =>
      classificarConflitos(
        { turmaId: "T9", formadorId: "F9", salaId: "S9", inicio: h("19:00"), fim: h("20:00"), ...nova },
        [existente],
      ).map((c) => c.tipo);

    expect(tipos({ turmaId: "T1" })).toEqual(["TURMA"]);
    expect(tipos({ formadorId: "F1" })).toEqual(["FORMADOR"]);
    expect(tipos({ salaId: "S1" })).toEqual(["SALA"]);
    expect(tipos({ turmaId: "T1", formadorId: "F1", salaId: "S1" })).toEqual(["TURMA", "FORMADOR", "SALA"]);
    expect(tipos({})).toEqual([]);
  });

  it("mensagem clara com sala e horário", () => {
    const [c] = classificarConflitos(
      { turmaId: "T9", formadorId: "F9", salaId: "S1", inicio: h("20:00"), fim: h("22:00") },
      [existente],
    );
    expect(c.mensagem).toContain("Sala 1");
    expect(c.mensagem).toContain("18:00");
  });

  it("ignora a própria sessão ao editar", () => {
    expect(
      classificarConflitos({ id: "s1", turmaId: "T1", formadorId: "F1", salaId: "S1", inicio: h("18:30"), fim: h("21:30") }, [existente]),
    ).toEqual([]);
  });
});
