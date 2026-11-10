import { describe, expect, it } from "vitest";
import {
  chaveAvaliacaoAnonima,
  gerarCodigoCertificado,
  gerarQrCodeSvg,
  verificarElegibilidadeCertificado,
} from "@/lib/certificados";
import {
  construirEmailHtmlRelatorio,
  gerarInterpretacaoDeterministica,
} from "@/lib/ia/claude";
import type { MetricasRelatorio } from "@/lib/ia/metricas";
import { calcularAssiduidade } from "@/lib/presencas";

describe("Fase 5 — Assiduidade Nominal e Alertas de Desistência", () => {
  it("deteta 2 faltas consecutivas e calcula percentagem considerando faltas justificadas", () => {
    const r = calcularAssiduidade([
      { id: "s1", inicio: "2026-10-01T09:00:00Z", estado: "REALIZADA", temChamadaLancada: true, estadoAluno: "PRESENTE" },
      { id: "s2", inicio: "2026-10-02T09:00:00Z", estado: "REALIZADA", temChamadaLancada: true, estadoAluno: "JUSTIFICADA" },
      { id: "s3", inicio: "2026-10-03T09:00:00Z", estado: "REALIZADA", temChamadaLancada: true, estadoAluno: "FALTA" },
      { id: "s4", inicio: "2026-10-04T09:00:00Z", estado: "REALIZADA", temChamadaLancada: true, estadoAluno: "FALTA" },
      { id: "s5", inicio: "2026-10-10T09:00:00Z", estado: "AGENDADA", temChamadaLancada: false, estadoAluno: null },
    ]);

    expect(r.sessoesRealizadas).toBe(4);
    expect(r.sessoesComChamada).toBe(4);
    expect(r.presencas).toBe(1);
    expect(r.justificadas).toBe(1);
    expect(r.faltas).toBe(2);
    expect(r.assiduidadePct).toBe(50);
    expect(r.faltasSeguidas).toBe(2);
    expect(r.alertaFaltasSeguidas).toBe(true);
  });

  it("não penaliza turmas concluídas antigas sem chamada nominal lançada", () => {
    const r = calcularAssiduidade([
      { id: "s1", inicio: "2026-09-01T09:00:00Z", estado: "REALIZADA", temChamadaLancada: false },
      { id: "s2", inicio: "2026-09-02T09:00:00Z", estado: "REALIZADA", temChamadaLancada: false },
    ]);
    expect(r.assiduidadePct).toBe(100);
    expect(r.alertaFaltasSeguidas).toBe(false);
  });
});

describe("Fase 5 — Certificados com QR Code e Avaliação Anónima", () => {
  it("bloqueia emissão se houver dívida ou assiduidade abaixo da meta", () => {
    const comDivida = verificarElegibilidadeCertificado({
      estadoMatricula: "CONCLUIDA",
      dividaCentimos: 25_000_00n,
      assiduidadePct: 90,
      minAssiduidadePct: 75,
    });
    expect(comDivida.elegivel).toBe(false);
    expect(comDivida.motivosBloqueio.some((m) => m.includes("valores financeiros pendentes"))).toBe(true);

    const faltoso = verificarElegibilidadeCertificado({
      estadoMatricula: "CONCLUIDA",
      dividaCentimos: 0n,
      assiduidadePct: 60,
      minAssiduidadePct: 75,
    });
    expect(faltoso.elegivel).toBe(false);
    expect(faltoso.motivosBloqueio[0]).toContain("60%");
  });

  it("liberta emissão quando CONCLUIDA, dívida 0 e assiduidade >= mínimo", async () => {
    const ok = verificarElegibilidadeCertificado({
      estadoMatricula: "CONCLUIDA",
      dividaCentimos: 0n,
      assiduidadePct: 80,
      minAssiduidadePct: 75,
    });
    expect(ok.elegivel).toBe(true);
    expect(ok.motivosBloqueio).toHaveLength(0);

    const codigo = gerarCodigoCertificado(2026);
    expect(codigo).toMatch(/^CERT-2026-[A-Z0-9]{8}$/);

    const svg = await gerarQrCodeSvg(`https://academia.ao/verificar/${codigo}`);
    expect(svg).toContain("<svg");
  });

  it("gera hash anónimo determinístico por matrícula e formador", () => {
    const h1 = chaveAvaliacaoAnonima("mat_1", "prof_1");
    const h2 = chaveAvaliacaoAnonima("mat_1", "prof_1");
    const h3 = chaveAvaliacaoAnonima("mat_1", "prof_2");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64);
  });
});

describe("Fase 5 — Relatórios IA com Secções Fixas e Números SQL Exatos", () => {
  it("mantém as 4 secções fixas e preserva os valores calculados em SQL", () => {
    const metricas: MetricasRelatorio = {
      tipo: "SEMANAL_COMERCIAL",
      centroNome: "Academia Demo Luanda",
      geradoEm: "2026-11-10T08:00:00.000Z",
      periodo: {
        inicio: "03/11/2026",
        fim: "10/11/2026",
        anteriorInicio: "27/10/2026",
        anteriorFim: "03/11/2026",
      },
      kpisDestaque: [
        { rotulo: "Novos Leads", valor: "18", comparacao: "+50,0% vs. semana anterior" },
        { rotulo: "Taxa de Conversão", valor: "33,3%", comparacao: "+8,3 p.p." },
      ],
      dadosDetalhados: {
        comercial: { leadsSemPrimeiroContactoMais48h: 2, followUpsCrmPendentes: 3 },
        cobranca: { taxaInadimplenciaPct: 14.5, parcelasEmAtrasoQtd: 4, valorTotalEmAtrasoKz: "120 000,00 Kz" },
        retencaoERiscoDesistencia: { totalFormandosEmRisco: 1 },
      },
    };

    const seccoes = gerarInterpretacaoDeterministica("Relatório Semanal Comercial", metricas);
    expect(seccoes.resumoExecutivo).toContain("18");
    expect(seccoes.resumoExecutivo).toContain("33,3%");
    expect(seccoes.variacoesPeriodo).toContain("+50,0%");
    expect(seccoes.pontosAtencao).toContain("120 000,00 Kz");
    expect(seccoes.acoesRecomendadas).toContain("1.");
    expect(seccoes.mensagemCurtaWhatsapp).toContain("*Relatório Semanal Comercial*");

    const html = construirEmailHtmlRelatorio(
      "Relatório Semanal Comercial",
      metricas,
      seccoes,
      "https://academia.ao/inteligencia/rel_1",
    );
    expect(html).toContain("1. Resumo Executivo");
    expect(html).toContain("2. Variações Face ao Período Anterior");
    expect(html).toContain("3. Pontos de Atenção");
    expect(html).toContain("4. Ações Recomendadas");
    expect(html).toContain("https://academia.ao/inteligencia/rel_1");
  });
});
