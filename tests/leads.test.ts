import { describe, expect, it } from "vitest";
import { instanteLocal } from "@/lib/datas";
import {
  estatisticasCampanhas,
  extrairIp,
  extrairUtms,
  hashIp,
  querystringUtm,
  resumoDatasTurma,
  rotuloPrecoFormacao,
} from "@/lib/leads";

describe("leads — funções puras", () => {
  it("extrairIp e hashIp", () => {
    expect(extrairIp("197.216.10.1, 10.0.0.1", "10.0.0.2")).toBe("197.216.10.1");
    expect(extrairIp(null, " 197.216.10.2 ")).toBe("197.216.10.2");
    expect(extrairIp("", "")).toBeNull();
    expect(hashIp(null)).toBeNull();
    expect(hashIp("197.216.10.1")).toHaveLength(32);
    expect(hashIp("197.216.10.1")).toBe(hashIp(" 197.216.10.1 "));
  });

  it("extrairUtms e querystringUtm preservam parâmetros de campanha", () => {
    const u = extrairUtms({
      utm_source: " facebook ",
      utm_campaign: ["excel-out", "ignorado"],
      fbclid: "IwAR123",
      outro: "x",
    });
    expect(u).toEqual({
      utm_source: "facebook",
      utm_medium: null,
      utm_campaign: "excel-out",
      utm_content: null,
      utm_term: null,
      fbclid: "IwAR123",
    });
    expect(querystringUtm(u)).toBe("?utm_source=facebook&utm_campaign=excel-out&fbclid=IwAR123");
  });

  it("rotuloPrecoFormacao identifica menor preço e variação entre turmas", () => {
    expect(rotuloPrecoFormacao(50_000_00n, [null, 50_000_00n])).toEqual({
      precoMinimo: 50_000_00n,
      aPartirDe: false,
    });
    expect(rotuloPrecoFormacao(50_000_00n, [null, 45_000_00n])).toEqual({
      precoMinimo: 45_000_00n,
      aPartirDe: true,
    });
  });

  it("resumoDatasTurma formata intervalo de datas em Luanda", () => {
    expect(resumoDatasTurma([])).toBeNull();
    const r = resumoDatasTurma([
      { inicio: instanteLocal("2026-11-10", "18:00"), fim: instanteLocal("2026-11-10", "21:00") },
      { inicio: instanteLocal("2026-11-03", "18:00"), fim: instanteLocal("2026-11-03", "21:00") },
    ]);
    expect(r?.textoDatas).toBe("03/11/2026 a 10/11/2026");
  });

  it("estatisticasCampanhas agrupa por origem/campanha e calcula conversão", () => {
    const stats = estatisticasCampanhas([
      { estado: "NOVO", utmSource: "facebook", utmCampaign: "out" },
      { estado: "CONVERTIDO", utmSource: "facebook", utmCampaign: "out" },
      { estado: "PERDIDO", fbclid: "abc" },
      { estado: "CONVERTIDO" },
    ]);
    expect(stats).toEqual([
      { origem: "facebook / out", total: 2, convertidos: 1, taxa: 50 },
      { origem: "Direto", total: 1, convertidos: 1, taxa: 100 },
      { origem: "Facebook / Instagram (anúncio)", total: 1, convertidos: 0, taxa: 0 },
    ]);
  });
});
