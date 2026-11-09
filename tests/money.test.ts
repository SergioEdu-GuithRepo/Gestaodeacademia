import { describe, expect, it } from "vitest";
import { centimosParaInput, formatKz, parseKz } from "@/lib/money";

describe("parseKz", () => {
  it.each([
    ["150000", 15_000_000n],
    ["150 000", 15_000_000n],
    ["150.000", 15_000_000n],
    ["150.000,50", 15_000_050n],
    ["150000,5", 15_000_050n],
    ["150000.75", 15_000_075n],
    ["1.234.567,89", 123_456_789n],
    ["95 000 Kz", 9_500_000n],
    ["0", 0n],
  ])("%s → %s cêntimos", (texto, esperado) => {
    expect(parseKz(texto)).toBe(esperado);
  });

  it.each(["", "abc", "12,", "-5", "1,2,3a"])("rejeita %j", (texto) => {
    expect(parseKz(texto)).toBeNull();
  });
});

describe("formatKz / centimosParaInput", () => {
  it("formata em kwanzas", () => {
    const s = formatKz(15_000_050n);
    expect(s).toMatch(/150/);
    expect(s).toMatch(/000,50/);
    expect(s).toMatch(/Kz|AOA/);
  });

  it("ida e volta input ↔ cêntimos", () => {
    for (const v of [0n, 5n, 100n, 15_000_050n, 9_500_000n]) {
      expect(parseKz(centimosParaInput(v))).toBe(v);
    }
  });
});
