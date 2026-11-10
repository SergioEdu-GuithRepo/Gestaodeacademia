import type { CanalEntregaRelatorio, Prisma, RelatorioIA, TipoRelatorioIA } from "@prisma/client";
import { diaLocal } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import { obterConfiguracao } from "@/lib/mensagens/config";
import { enfileirar } from "@/lib/mensagens/enfileirar";
import { decifrar } from "@/lib/segredos";
import {
  construirEmailHtmlRelatorio,
  gerarTextoRelatorioClaude,
  NOMES_TIPO_RELATORIO,
} from "./claude";
import {
  calcularMetricasMensalFinanceiro,
  calcularMetricasPorFormacao,
  calcularMetricasPorFormador,
  calcularMetricasSemanalComercial,
  verificarMetricasAlertaImediato,
  type MetricasRelatorio,
} from "./metricas";

async function enviarEmailHtml(params: {
  apiKey: string | null;
  remetente: string | null;
  destinatarios: string[];
  assunto: string;
  html: string;
}): Promise<{ enviado: boolean; erro?: string }> {
  if (params.destinatarios.length === 0) {
    return { enviado: false, erro: "Nenhum destinatário de e-mail configurado." };
  }
  const chave = params.apiKey?.trim() || process.env.RESEND_API_KEY?.trim() || null;
  if (!chave) {
    return {
      enviado: false,
      erro: "Envio de e-mail não configurado (defina RESEND_API_KEY ou a chave de e-mail em Configurações).",
    };
  }

  const de =
    params.remetente?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "Relatórios Academia <onboarding@resend.dev>";

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: de,
        to: params.destinatarios,
        subject: params.assunto,
        html: params.html,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { enviado: false, erro: `Falha no serviço de e-mail (${resp.status}): ${txt.slice(0, 140)}` };
    }
    return { enviado: true };
  } catch (e) {
    return { enviado: false, erro: e instanceof Error ? e.message : "Erro de rede ao enviar e-mail." };
  }
}

export type OpcoesGerarRelatorio = {
  tenantId: string;
  tipo: TipoRelatorioIA;
  formacaoId?: string | null;
  formadorId?: string | null;
  canalOverride?: CanalEntregaRelatorio | null;
  chaveIdempotencia?: string | null;
  geradoPorId?: string | null;
  urlBaseApp?: string;
  /** Quando false (ex.: cron de alertas), só grava/envia se houver anomalia real. */
  forcarAlertaManual?: boolean;
};

export async function gerarEEntregarRelatorio(
  opts: OpcoesGerarRelatorio,
): Promise<{ relatorio: RelatorioIA | null; ignoradoMotivo?: string }> {
  const { tenantId, tipo } = opts;
  const db = dbTenant({ tenantId, userId: opts.geradoPorId ?? null });
  const cfg = await obterConfiguracao(prisma, tenantId);

  if (opts.chaveIdempotencia) {
    const jaExiste = await db.relatorioIA.findFirst({
      where: { chaveIdempotencia: opts.chaveIdempotencia },
    });
    if (jaExiste) {
      return { relatorio: jaExiste, ignoradoMotivo: "Já gerado para este período (idempotente)." };
    }
  }

  let metricas: MetricasRelatorio;
  let inicio: Date;
  let fim: Date;
  let antInicio: Date | undefined;
  let antFim: Date | undefined;
  let sufixoTitulo = "";

  if (tipo === "SEMANAL_COMERCIAL") {
    const r = await calcularMetricasSemanalComercial(tenantId);
    metricas = r.metricas;
    inicio = r.inicio;
    fim = r.fim;
    antInicio = r.antInicio;
    antFim = r.antFim;
  } else if (tipo === "MENSAL_FINANCEIRO") {
    const r = await calcularMetricasMensalFinanceiro(tenantId);
    metricas = r.metricas;
    inicio = r.inicio;
    fim = r.fim;
    antInicio = r.antInicio;
    antFim = r.antFim;
  } else if (tipo === "POR_FORMACAO") {
    if (!opts.formacaoId) throw new Error("Selecione uma formação para gerar este relatório.");
    const r = await calcularMetricasPorFormacao(tenantId, opts.formacaoId);
    metricas = r.metricas;
    inicio = r.inicio;
    fim = r.fim;
    const nomeF = (r.metricas.dadosDetalhados.formacao as { nome?: string } | undefined)?.nome;
    if (nomeF) sufixoTitulo = ` — ${nomeF}`;
  } else if (tipo === "POR_FORMADOR") {
    if (!opts.formadorId) throw new Error("Selecione um formador para gerar este relatório.");
    const r = await calcularMetricasPorFormador(tenantId, opts.formadorId);
    metricas = r.metricas;
    inicio = r.inicio;
    fim = r.fim;
    const nomeProf = (r.metricas.dadosDetalhados.formador as { nome?: string } | undefined)?.nome;
    if (nomeProf) sufixoTitulo = ` — ${nomeProf}`;
  } else {
    const r = await verificarMetricasAlertaImediato(
      tenantId,
      cfg.limiarInadimplenciaPct,
      Boolean(opts.forcarAlertaManual),
    );
    if (!r.deveDisparar) {
      return { relatorio: null, ignoradoMotivo: "Indicadores dentro dos parâmetros normais." };
    }
    metricas = r.metricas;
    inicio = r.inicio;
    fim = r.fim;
  }

  const titulo = `${NOMES_TIPO_RELATORIO[tipo]}${sufixoTitulo}`;
  const chaveClaude = decifrar(cfg.anthropicApiKey);
  const seccoes = await gerarTextoRelatorioClaude({
    titulo,
    metricas,
    apiKey: chaveClaude,
    modelo: cfg.modeloClaude,
  });

  const canal = opts.canalOverride ?? cfg.canalRelatorio;
  const base =
    opts.urlBaseApp?.replace(/\/+$/, "") ||
    process.env.APP_BASE_URL?.replace(/\/+$/, "") ||
    "";
  const corpoEmailInicial = construirEmailHtmlRelatorio(titulo, metricas, seccoes);

  const criado = await db.relatorioIA.create({
    data: {
      tenantId,
      tipo,
      titulo,
      periodoInicio: inicio,
      periodoFim: fim,
      periodoAnteriorInicio: antInicio ?? null,
      periodoAnteriorFim: antFim ?? null,
      formacaoId: opts.formacaoId ?? null,
      formadorId: opts.formadorId ?? null,
      chaveIdempotencia: opts.chaveIdempotencia ?? null,
      metricasSql: metricas as unknown as Prisma.InputJsonValue,
      resumoExecutivo: seccoes.resumoExecutivo,
      variacoesPeriodo: seccoes.variacoesPeriodo,
      pontosAtencao: seccoes.pontosAtencao,
      acoesRecomendadas: seccoes.acoesRecomendadas,
      mensagemCurtaWhatsapp: seccoes.mensagemCurtaWhatsapp,
      corpoEmailHtml: corpoEmailInicial,
      modeloUtilizado: seccoes.modeloUtilizado,
      canalSolicitado: canal,
      geradoPorId: opts.geradoPorId ?? null,
    },
  });

  const urlRelatorio = base ? `${base}/inteligencia/${criado.id}` : undefined;
  const htmlComLink = urlRelatorio
    ? construirEmailHtmlRelatorio(titulo, metricas, seccoes, urlRelatorio)
    : corpoEmailInicial;

  const erros: string[] = [];
  let entregueWhatsapp = false;
  let entregueEmail = false;

  if (canal === "WHATSAPP" || canal === "AMBOS") {
    const destinosWa =
      cfg.destinatariosWhatsappRelatorio.length > 0
        ? cfg.destinatariosWhatsappRelatorio
        : cfg.numerosEquipaComercial;

    if (destinosWa.length === 0) {
      erros.push("Sem números WhatsApp destinatários configurados.");
    } else {
      const textoWa = urlRelatorio
        ? `${seccoes.mensagemCurtaWhatsapp}\n\n🔗 ${urlRelatorio}`
        : seccoes.mensagemCurtaWhatsapp;
      let enviados = 0;
      for (const numero of destinosWa) {
        const resWa = await enfileirar(prisma, {
          tenantId,
          tipo: tipo === "ALERTA_IMEDIATO" ? "ALERTA_IA" : "RELATORIO_IA",
          destino: numero,
          texto: textoWa,
          chave: `rel-ia:${criado.id}:${numero}`,
          refs: { criadaPorId: opts.geradoPorId ?? null },
          forcar: Boolean(opts.geradoPorId),
        });
        if (resWa === "ENFILEIRADA" || resWa === "DUPLICADA") enviados++;
      }
      entregueWhatsapp = enviados > 0;
      if (!entregueWhatsapp) {
        erros.push("WhatsApp desativado ou números inválidos.");
      }
    }
  }

  if (canal === "EMAIL" || canal === "AMBOS") {
    const resEmail = await enviarEmailHtml({
      apiKey: decifrar(cfg.resendApiKey),
      remetente: cfg.emailRemetente,
      destinatarios: cfg.destinatariosEmailRelatorio,
      assunto: `[${metricas.centroNome}] ${titulo}`,
      html: htmlComLink,
    });
    entregueEmail = resEmail.enviado;
    if (!resEmail.enviado && resEmail.erro) erros.push(resEmail.erro);
  }

  const atualizado = await db.relatorioIA.update({
    where: { id: criado.id },
    data: {
      corpoEmailHtml: htmlComLink,
      entregueWhatsapp,
      entregueEmail,
      erroEntrega: erros.length > 0 ? erros.join(" | ") : null,
    },
  });

  return { relatorio: atualizado };
}

/** Reenvia um relatório já guardado no histórico para WhatsApp e/ou E-mail. */
export async function reenviarRelatorioExistente(params: {
  tenantId: string;
  relatorioId: string;
  canal: "WHATSAPP" | "EMAIL" | "AMBOS";
  userId?: string | null;
  urlBaseApp?: string;
}): Promise<{ ok?: string; aviso?: string; erro?: string }> {
  const db = dbTenant({ tenantId: params.tenantId, userId: params.userId ?? null });
  const rel = await db.relatorioIA.findFirst({ where: { id: params.relatorioId } });
  if (!rel) return { erro: "Relatório não encontrado." };

  const cfg = await obterConfiguracao(prisma, params.tenantId);
  const erros: string[] = [];
  let okWa = rel.entregueWhatsapp;
  let okEm = rel.entregueEmail;
  const sufixoReenvio = Date.now().toString(36);

  if (params.canal === "WHATSAPP" || params.canal === "AMBOS") {
    const destinosWa =
      cfg.destinatariosWhatsappRelatorio.length > 0
        ? cfg.destinatariosWhatsappRelatorio
        : cfg.numerosEquipaComercial;
    if (destinosWa.length === 0) {
      erros.push("Adicione pelo menos um número WhatsApp destinatário nas configurações de IA.");
    } else {
      const link = params.urlBaseApp ? `\n\n🔗 ${params.urlBaseApp.replace(/\/+$/, "")}/inteligencia/${rel.id}` : "";
      let cont = 0;
      for (const n of destinosWa) {
        const r = await enfileirar(prisma, {
          tenantId: params.tenantId,
          tipo: rel.tipo === "ALERTA_IMEDIATO" ? "ALERTA_IA" : "RELATORIO_IA",
          destino: n,
          texto: `${rel.mensagemCurtaWhatsapp}${link}`,
          chave: `reenvio:${rel.id}:${n}:${sufixoReenvio}`,
          refs: { criadaPorId: params.userId ?? null },
          forcar: true,
        });
        if (r === "ENFILEIRADA") cont++;
      }
      if (cont > 0) okWa = true;
    }
  }

  if (params.canal === "EMAIL" || params.canal === "AMBOS") {
    const rEm = await enviarEmailHtml({
      apiKey: decifrar(cfg.resendApiKey),
      remetente: cfg.emailRemetente,
      destinatarios: cfg.destinatariosEmailRelatorio,
      assunto: `${rel.titulo}`,
      html: rel.corpoEmailHtml,
    });
    if (rEm.enviado) okEm = true;
    else if (rEm.erro) erros.push(rEm.erro);
  }

  await db.relatorioIA.update({
    where: { id: rel.id },
    data: {
      entregueWhatsapp: okWa,
      entregueEmail: okEm,
      erroEntrega: erros.length > 0 ? erros.join(" | ") : null,
    },
  });

  if (erros.length > 0) return { aviso: erros.join(" ") };
  return { ok: "Relatório enviado com sucesso para os destinatários configurados." };
}

/**
 * Tarefa programada (Cron): percorre todos os centros com `iaAtiva = true`,
 * respeitando a frequência semanal, mensal e os alertas imediatos de cada centro.
 */
export async function executarCicloCronRelatorios(agora = new Date()) {
  const local = diaLocal(agora);
  const partesData = local.split("-");
  const ano = Number(partesData[0]);
  const mes = Number(partesData[1]);
  const diaMes = Number(partesData[2]);
  const dataRef = new Date(`${local}T12:00:00Z`);
  const diaSemana = dataRef.getUTCDay(); // 0=Dom, 1=Seg, ...

  const configs = await prisma.configuracaoCentro.findMany({
    where: { iaAtiva: true },
    select: {
      tenantId: true,
      relatorioSemanalAtivo: true,
      diaSemanaRelatorio: true,
      relatorioMensalAtivo: true,
      diaMesRelatorio: true,
      alertasImediatosAtivos: true,
    },
  });

  const resultados: { tenantId: string; gerados: TipoRelatorioIA[]; ignorados: string[] }[] = [];

  for (const c of configs) {
    const gerados: TipoRelatorioIA[] = [];
    const ignorados: string[] = [];

    // 1. Semanal Comercial (ex.: toda segunda-feira)
    if (c.relatorioSemanalAtivo && diaSemana === c.diaSemanaRelatorio) {
      const r = await gerarEEntregarRelatorio({
        tenantId: c.tenantId,
        tipo: "SEMANAL_COMERCIAL",
        chaveIdempotencia: `cron:semanal:${local}`,
      });
      if (r.relatorio && !r.ignoradoMotivo) gerados.push("SEMANAL_COMERCIAL");
      else if (r.ignoradoMotivo) ignorados.push(`Semanal: ${r.ignoradoMotivo}`);
    }

    // 2. Mensal Financeiro (ex.: dia 1 de cada mês)
    if (c.relatorioMensalAtivo && diaMes === c.diaMesRelatorio) {
      const chaveMes = `${ano}-${String(mes).padStart(2, "0")}`;
      const r = await gerarEEntregarRelatorio({
        tenantId: c.tenantId,
        tipo: "MENSAL_FINANCEIRO",
        chaveIdempotencia: `cron:mensal:${chaveMes}`,
      });
      if (r.relatorio && !r.ignoradoMotivo) gerados.push("MENSAL_FINANCEIRO");
      else if (r.ignoradoMotivo) ignorados.push(`Mensal: ${r.ignoradoMotivo}`);
    }

    // 3. Alertas Imediatos (diário, só dispara se fugir do limiar configurado)
    if (c.alertasImediatosAtivos) {
      const r = await gerarEEntregarRelatorio({
        tenantId: c.tenantId,
        tipo: "ALERTA_IMEDIATO",
        chaveIdempotencia: `cron:alerta:${local}`,
        forcarAlertaManual: false,
      });
      if (r.relatorio && !r.ignoradoMotivo) gerados.push("ALERTA_IMEDIATO");
      else if (r.ignoradoMotivo) ignorados.push(`Alerta: ${r.ignoradoMotivo}`);
    }

    resultados.push({ tenantId: c.tenantId, gerados, ignorados });
  }

  return {
    ok: true,
    dataLocalLuanda: local,
    centrosVerificados: configs.length,
    resultados,
  };
}
