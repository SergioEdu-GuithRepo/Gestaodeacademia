import { describe, expect, it } from "vitest";
import type { ConfiguracaoCentro } from "@prisma/client";
import {
  parseDiasAposAtraso,
  parseNumerosEquipa,
  tokenizarWhatsapp,
  truncar,
  urlBase,
} from "@/lib/configuracoes";
import { configEvolution, nomeInstanciaPadrao } from "@/lib/mensagens/config";
import { gerarSlugCentro } from "@/lib/superadmin-cliente";

describe("configuracoes — funções puras", () => {
  it("parseDiasAposAtraso ordena, remove duplicados e valida limites", () => {
    expect(parseDiasAposAtraso("7, 1, 7 ; 15")).toEqual({ dias: [1, 7, 15] });
    expect(parseDiasAposAtraso("")).toEqual({ dias: [] });
    expect(parseDiasAposAtraso("0, 5")).toHaveProperty("erro");
    expect(parseDiasAposAtraso("91")).toHaveProperty("erro");
    expect(parseDiasAposAtraso("abc")).toHaveProperty("erro");
  });

  it("parseNumerosEquipa normaliza números angolanos e internacionais e sinaliza inválidos", () => {
    const r = parseNumerosEquipa("923 000 111\n+244923000111\n+351912345678\n123");
    expect(r.numeros).toEqual(["+244923000111", "+351912345678"]);
    expect(r.invalidos).toEqual(["123"]);
  });

  it("tokenizarWhatsapp interpreta *negrito*, _itálico_, ~riscado~ e quebras de linha", () => {
    const segs = tokenizarWhatsapp("Olá *Ana*!\n_Tudo_ ~bem~?");
    expect(segs).toEqual([
      { tipo: "texto", texto: "Olá " },
      { tipo: "negrito", filhos: [{ tipo: "texto", texto: "Ana" }] },
      { tipo: "texto", texto: "!" },
      { tipo: "quebra" },
      { tipo: "italico", filhos: [{ tipo: "texto", texto: "Tudo" }] },
      { tipo: "texto", texto: " " },
      { tipo: "riscado", filhos: [{ tipo: "texto", texto: "bem" }] },
      { tipo: "texto", texto: "?" },
    ]);
  });

  it("truncar e urlBase", () => {
    expect(truncar("  texto   curto ", 20)).toBe("texto curto");
    expect(truncar("abcdefghij", 6)).toBe("abcde…");
    expect(urlBase("https://app.ao/", "ignored", "http")).toBe("https://app.ao");
    expect(urlBase("", "localhost:3100", null)).toBe("http://localhost:3100");
    expect(urlBase(null, "academia.ao", "https")).toBe("https://academia.ao");
  });

  it("gerarSlugCentro, nomeInstanciaPadrao e fallback global da Evolution API", () => {
    expect(gerarSlugCentro("Centro Formar+ Luanda (Talatona)")).toBe("centro-formar-luanda-talatona");
    expect(nomeInstanciaPadrao("formar-mais")).toBe("centro-formar-mais");

    const cfgVazia = {
      tenantId: "t1234567890",
      evolutionUrl: null,
      evolutionApiKey: null,
      evolutionInstancia: null,
    } as unknown as ConfiguracaoCentro;

    const prevUrl = process.env.EVOLUTION_API_URL;
    const prevKey = process.env.EVOLUTION_API_KEY;
    try {
      delete process.env.EVOLUTION_API_URL;
      delete process.env.EVOLUTION_API_KEY;
      expect(configEvolution(cfgVazia, "formarmais")).toBeNull();

      process.env.EVOLUTION_API_URL = "https://evolution.railway.app";
      process.env.EVOLUTION_API_KEY = "chave-global-railway";
      expect(configEvolution(cfgVazia, "formarmais")).toEqual({
        url: "https://evolution.railway.app",
        apiKey: "chave-global-railway",
        instancia: "centro-formarmais",
      });
    } finally {
      if (prevUrl === undefined) delete process.env.EVOLUTION_API_URL;
      else process.env.EVOLUTION_API_URL = prevUrl;
      if (prevKey === undefined) delete process.env.EVOLUTION_API_KEY;
      else process.env.EVOLUTION_API_KEY = prevKey;
    }
  });
});
