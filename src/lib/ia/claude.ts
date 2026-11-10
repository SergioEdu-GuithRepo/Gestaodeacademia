import type { TipoRelatorioIA } from "@prisma/client";
import type { MetricasRelatorio } from "./metricas";

export const NOMES_TIPO_RELATORIO: Record<TipoRelatorioIA, string> = {
  SEMANAL_COMERCIAL: "Relatório Semanal Comercial & CRM",
  MENSAL_FINANCEIRO: "Relatório Mensal Financeiro",
  POR_FORMACAO: "Relatório de Qualidade e Ocupação por Formação",
  POR_FORMADOR: "Relatório de Desempenho por Formador",
  ALERTA_IMEDIATO: "Alerta Imediato de Anomalia Operacional",
};

export type SeccoesFixasRelatorio = {
  resumoExecutivo: string;
  variacoesPeriodo: string;
  pontosAtencao: string;
  acoesRecomendadas: string;
  mensagemCurtaWhatsapp: string;
  modeloUtilizado: string;
};

const SYSTEM_PROMPT_CLAUDE = `És o Analista Executivo de Gestão e CRM de um centro de formação profissional em Angola.
Receberás um objeto JSON ("metricasSql") com indicadores EXATOS já calculados pela base de dados PostgreSQL do centro.

REGRAS OBRIGATÓRIAS E INVIOLÁVEIS:
1. NUNCA faças cálculos aritméticos por conta própria, não estimes valores e NUNCA inventes números.
2. Cita EXCLUSIVAMENTE os números, percentagens e montantes em Kwanzas (Kz) exatamente como constam em "metricasSql".
3. Escreve em português de Angola/Portugal (pt-AO), num tom executivo, claro, direto e acionável.
4. Devolve APENAS um objeto JSON válido (sem blocos markdown \`\`\`json), respeitando SEMPRE estas 5 chaves exatas na mesma ordem lógica:
{
  "resumoExecutivo": "2 a 4 frases diretas com a síntese global do período e os principais indicadores.",
  "variacoesPeriodo": "Análise objetiva das subidas/descidas face ao período anterior (ou comparativo histórico se for relatório de formação/formador/alerta), usando apenas as variações já fornecidas no JSON.",
  "pontosAtencao": "Lista em tópicos (iniciados por '• ') dos gargalos, inadimplência, formandos em risco de desistência, turmas com baixa ocupação ou alertas críticos.",
  "acoesRecomendadas": "Lista numerada ('1. ', '2. ', '3. ') com 3 a 4 ações práticas imediatas para a equipa comercial, pedagógica ou financeira executar esta semana.",
  "mensagemCurtaWhatsapp": "Resumo curto pronto a enviar no WhatsApp do gestor (máx. 900 caracteres), usando *negrito* do WhatsApp nos títulos e números-chave."
}`;

function extrairJsonSeguro(texto: string): Partial<SeccoesFixasRelatorio> | null {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (inicio === -1 || fim === -1 || fim <= inicio) return null;
  try {
    return JSON.parse(limpo.slice(inicio, fim + 1)) as Partial<SeccoesFixasRelatorio>;
  } catch {
    return null;
  }
}

/**
 * Fallback estruturado determinístico (quando a chave Claude ainda não está configurada
 * ou ocorre indisponibilidade temporária da rede): usa estritamente os números SQL nas
 * mesmas 4 secções fixas, garantindo disponibilidade 100%.
 */
export function gerarInterpretacaoDeterministica(
  titulo: string,
  m: MetricasRelatorio,
  motivoFallback = "motor-analitico-sql",
): SeccoesFixasRelatorio {
  const kpisLinha = m.kpisDestaque.map((k) => `${k.rotulo}: ${k.valor}`).join(" · ");
  const comparacoes = m.kpisDestaque
    .filter((k) => k.comparacao)
    .map((k) => `• ${k.rotulo}: ${k.valor} (${k.comparacao})`)
    .join("\n");

  const d = m.dadosDetalhados as Record<string, Record<string, unknown>>;
  const alertasLista: string[] = [];

  if (m.tipo === "SEMANAL_COMERCIAL") {
    const cob = d.cobranca ?? {};
    const ret = d.retencaoERiscoDesistencia ?? {};
    const com = d.comercial ?? {};
    alertasLista.push(
      `• Inadimplência atual em ${cob.taxaInadimplenciaPct ?? 0}% (${cob.parcelasEmAtrasoQtd ?? 0} parcelas vencidas, total de ${cob.valorTotalEmAtrasoKz ?? "0,00 Kz"}).`,
    );
    alertasLista.push(
      `• ${ret.totalFormandosEmRisco ?? 0} formando(s) sinalizado(s) em risco de desistência por faltas ou atraso financeiro.`,
    );
    alertasLista.push(
      `• ${com.leadsSemPrimeiroContactoMais48h ?? 0} lead(s) sem primeiro contacto há mais de 48h e ${com.followUpsCrmPendentes ?? 0} follow-up(s) CRM vencido(s).`,
    );
  } else if (m.tipo === "MENSAL_FINANCEIRO") {
    const inad = d.inadimplencia ?? {};
    const form = d.formadores ?? {};
    alertasLista.push(
      `• Valor vencido pendente de cobrança: ${inad.valorEmAtrasoKz ?? "0,00 Kz"} (${inad.taxaInadimplenciaPct ?? 0}% de inadimplência).`,
    );
    alertasLista.push(
      `• Honorários gerados no período: ${form.honorariosGeradosKz ?? "0,00 Kz"} face a ${form.pagamentosEfetuadosKz ?? "0,00 Kz"} liquidados.`,
    );
  } else if (m.tipo === "ALERTA_IMEDIATO") {
    const anomalias = (m.dadosDetalhados.anomaliasDetetadas as string[] | undefined) ?? [];
    for (const a of anomalias) alertasLista.push(`• ${a}`);
  } else {
    for (const k of m.kpisDestaque) {
      alertasLista.push(`• ${k.rotulo}: ${k.valor}${k.comparacao ? ` — ${k.comparacao}` : ""}.`);
    }
  }

  const resumoExecutivo = `${m.centroNome} — ${titulo} (${m.periodo.inicio} a ${m.periodo.fim}). Indicadores apurados na base de dados: ${kpisLinha}.`;
  const variacoesPeriodo =
    comparacoes || "• Sem período anterior comparável para este recorte específico.";
  const pontosAtencao =
    alertasLista.join("\n") || "• Nenhum desvio crítico identificado nos indicadores atuais.";
  const acoesRecomendadas = [
    "1. Contactar prioritariamente os leads em aberto há mais de 48h e executar os follow-ups agendados no CRM.",
    "2. Abordar individualmente os formandos com parcelas vencidas ou faltas consecutivas antes da próxima sessão.",
    "3. Rever a ocupação das turmas planeadas e reforçar divulgação nas formações com vagas disponíveis.",
  ].join("\n");

  const mensagemCurtaWhatsapp = [
    `📊 *${titulo}*`,
    `🏛️ _${m.centroNome}_ (${m.periodo.inicio} – ${m.periodo.fim})`,
    "",
    ...m.kpisDestaque.map((k) => `• *${k.rotulo}:* ${k.valor}`),
    "",
    "⚠️ *Pontos de Atenção:*",
    alertasLista.slice(0, 2).join("\n"),
    "",
    "✅ Consulte o relatório completo (PDF/A4) em *CRM & Relatórios IA*.",
  ].join("\n");

  return {
    resumoExecutivo,
    variacoesPeriodo,
    pontosAtencao,
    acoesRecomendadas,
    mensagemCurtaWhatsapp,
    modeloUtilizado: motivoFallback,
  };
}

/**
 * Envia os indicadores já calculados à API do Claude (`https://api.anthropic.com/v1/messages`)
 * para interpretação nas 4 secções fixas. Se não existir API key configurada, usa o motor
 * estruturado determinístico sem falhar.
 */
export async function gerarTextoRelatorioClaude(params: {
  titulo: string;
  metricas: MetricasRelatorio;
  apiKey: string | null;
  modelo?: string | null;
}): Promise<SeccoesFixasRelatorio> {
  const chave = params.apiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null;
  const modelo = params.modelo?.trim() || process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";

  if (!chave) {
    return gerarInterpretacaoDeterministica(params.titulo, params.metricas, "motor-analitico-sql");
  }

  const promptUtilizador = [
    `Título do Relatório: ${params.titulo}`,
    `Tipo: ${NOMES_TIPO_RELATORIO[params.metricas.tipo]}`,
    `Centro (isolado por tenant): ${params.metricas.centroNome}`,
    "",
    "Dados exatos apurados por SQL na base de dados (`metricasSql`):",
    JSON.stringify(params.metricas, null, 2),
  ].join("\n");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35_000);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 1800,
        temperature: 0.2,
        system: SYSTEM_PROMPT_CLAUDE,
        messages: [{ role: "user", content: promptUtilizador }],
      }),
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      return gerarInterpretacaoDeterministica(
        params.titulo,
        params.metricas,
        `fallback-sql (Claude HTTP ${resp.status})`,
      );
    }

    const body = (await resp.json()) as {
      model?: string;
      content?: { type: string; text?: string }[];
    };
    const textoBruto = (body.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n");

    const parsed = extrairJsonSeguro(textoBruto);
    if (
      !parsed?.resumoExecutivo ||
      !parsed?.variacoesPeriodo ||
      !parsed?.pontosAtencao ||
      !parsed?.acoesRecomendadas
    ) {
      return gerarInterpretacaoDeterministica(params.titulo, params.metricas, "fallback-sql (formato)");
    }

    const fallback = gerarInterpretacaoDeterministica(params.titulo, params.metricas);
    return {
      resumoExecutivo: String(parsed.resumoExecutivo).trim(),
      variacoesPeriodo: String(parsed.variacoesPeriodo).trim(),
      pontosAtencao: String(parsed.pontosAtencao).trim(),
      acoesRecomendadas: String(parsed.acoesRecomendadas).trim(),
      mensagemCurtaWhatsapp: String(parsed.mensagemCurtaWhatsapp || fallback.mensagemCurtaWhatsapp).trim(),
      modeloUtilizado: body.model || modelo,
    };
  } catch {
    return gerarInterpretacaoDeterministica(params.titulo, params.metricas, "fallback-sql (rede)");
  } finally {
    clearTimeout(timer);
  }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatarBlocoHtml(texto: string): string {
  return escHtml(texto).replace(/\n/g, "<br />");
}

/** Constrói HTML editorial limpo para envio por e-mail e pré-visualização. */
export function construirEmailHtmlRelatorio(
  titulo: string,
  m: MetricasRelatorio,
  seccoes: SeccoesFixasRelatorio,
  urlRelatorio?: string,
): string {
  const cartoesKpi = m.kpisDestaque
    .map(
      (k) => `
      <td style="padding:12px;background:#FAF9F5;border:1px solid #E5E3DC;border-radius:14px;vertical-align:top;width:25%;">
        <div style="font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:0.04em;">${escHtml(k.rotulo)}</div>
        <div style="font-size:18px;font-weight:700;color:#1C1D21;margin-top:4px;">${escHtml(k.valor)}</div>
        ${k.comparacao ? `<div style="font-size:11px;color:#52525B;margin-top:4px;">${escHtml(k.comparacao)}</div>` : ""}
      </td>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8" /><title>${escHtml(titulo)}</title></head>
<body style="margin:0;padding:24px;background:#F5F4EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1C1D21;">
  <div style="max-width:680px;margin:0 auto;background:#FFFFFF;border-radius:24px;overflow:hidden;border:1px solid #E5E3DC;">
    <div style="background:#1C1D21;color:#FFFFFF;padding:28px 32px;">
      <div style="display:inline-block;background:#FBD34D;color:#1C1D21;font-weight:800;font-size:11px;padding:4px 10px;border-radius:999px;text-transform:uppercase;">
        ${escHtml(NOMES_TIPO_RELATORIO[m.tipo])}
      </div>
      <h1 style="margin:12px 0 4px;font-size:22px;font-weight:700;">${escHtml(titulo)}</h1>
      <p style="margin:0;font-size:13px;color:#A1A1AA;">
        ${escHtml(m.centroNome)} · Período: ${escHtml(m.periodo.inicio)} a ${escHtml(m.periodo.fim)}
      </p>
    </div>

    <div style="padding:28px 32px;">
      <table role="presentation" style="width:100%;border-spacing:8px;margin:-8px 0 20px;">
        <tr>${cartoesKpi}</tr>
      </table>

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#71717A;border-bottom:1px dotted #D4D4D8;padding-bottom:6px;">1. Resumo Executivo</h2>
      <p style="font-size:14px;line-height:1.65;color:#27272A;">${formatarBlocoHtml(seccoes.resumoExecutivo)}</p>

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#71717A;border-bottom:1px dotted #D4D4D8;padding-bottom:6px;margin-top:22px;">2. Variações Face ao Período Anterior</h2>
      <p style="font-size:14px;line-height:1.65;color:#27272A;">${formatarBlocoHtml(seccoes.variacoesPeriodo)}</p>

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#71717A;border-bottom:1px dotted #D4D4D8;padding-bottom:6px;margin-top:22px;">3. Pontos de Atenção</h2>
      <p style="font-size:14px;line-height:1.65;color:#27272A;">${formatarBlocoHtml(seccoes.pontosAtencao)}</p>

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#71717A;border-bottom:1px dotted #D4D4D8;padding-bottom:6px;margin-top:22px;">4. Ações Recomendadas</h2>
      <p style="font-size:14px;line-height:1.65;color:#27272A;">${formatarBlocoHtml(seccoes.acoesRecomendadas)}</p>

      ${
        urlRelatorio
          ? `<div style="margin-top:28px;text-align:center;">
              <a href="${escHtml(urlRelatorio)}" style="display:inline-block;background:#1C1D21;color:#FBD34D;text-decoration:none;font-weight:700;font-size:13px;padding:12px 24px;border-radius:999px;">
                Abrir Relatório Completo / Imprimir PDF ↗
              </a>
            </div>`
          : ""
      }
    </div>

    <div style="background:#FAF9F5;padding:16px 32px;font-size:11px;color:#71717A;border-top:1px solid #E5E3DC;">
      Indicadores calculados por SQL na base de dados de ${escHtml(m.centroNome)} · Interpretado por ${escHtml(seccoes.modeloUtilizado)}.
    </div>
  </div>
</body>
</html>`;
}
