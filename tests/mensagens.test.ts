/**
 * Mensagens WhatsApp: funções puras + integração com a BD local
 * (agendador idempotente, worker com envio simulado/mockado, webhook,
 * confirmação de pagamento e plano concluído).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { instanteLocal } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { agendarCentro, dentroDoHorario, fazAnos, partesLocais } from "@/lib/mensagens/agendador";
import { enfileirar } from "@/lib/mensagens/enfileirar";
import { processarFila, proximaTentativa, type EstadoWorker } from "@/lib/mensagens/envio";
import { aoRegistarPagamento, formatarSugestoes, origemLead } from "@/lib/mensagens/eventos";
import { renderizar } from "@/lib/mensagens/modelos";
import { aplicarAtualizacoes, interpretarWebhook, podeTransitar } from "@/lib/mensagens/webhook";
import { cifrar } from "@/lib/segredos";
import { ErroEnvio } from "@/lib/whatsapp/evolution";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("funções puras", () => {
  it("renderizar substitui variáveis e limpa linhas em excesso", () => {
    expect(renderizar("Olá {{ nome }}, {{x}}!\n\n\n\nFim", { nome: "Ana" })).toBe("Olá Ana, !\n\nFim");
    expect(renderizar("{{a}}{{b}}", { a: 1, b: null })).toBe("1");
  });

  it("proximaTentativa cresce e desiste após 5 tentativas", () => {
    const agora = new Date("2030-01-01T00:00:00Z");
    expect(proximaTentativa(1, agora)!.getTime() - agora.getTime()).toBe(60_000);
    expect(proximaTentativa(2, agora)!.getTime() - agora.getTime()).toBe(300_000);
    expect(proximaTentativa(4, agora)!.getTime() - agora.getTime()).toBe(7_200_000);
    expect(proximaTentativa(5, agora)).toBeNull();
  });

  it("aniversários, incluindo 29 de fevereiro", () => {
    expect(fazAnos(d("1990-03-10"), d("2031-03-10"))).toBe(true);
    expect(fazAnos(d("1990-03-10"), d("2031-03-11"))).toBe(false);
    expect(fazAnos(d("2000-02-29"), d("2031-02-28"))).toBe(true);
    expect(fazAnos(d("2000-02-29"), d("2032-02-28"))).toBe(false);
    expect(fazAnos(d("2000-02-29"), d("2032-02-29"))).toBe(true);
  });

  it("horário de envio no fuso de Luanda", () => {
    expect(partesLocais(new Date("2031-03-09T23:30:00Z"))).toEqual({ hoje: "2031-03-10", hora: 0 });
    expect(dentroDoHorario(8, 9)).toBe(false);
    expect(dentroDoHorario(9, 9)).toBe(true);
    expect(dentroDoHorario(21, 9)).toBe(false);
    expect(dentroDoHorario(22, 22)).toBe(true);
  });

  it("webhook: interpreta formatos v2 e ignora outros eventos", () => {
    expect(
      interpretarWebhook({ event: "messages.update", data: { keyId: "A1", fromMe: true, status: "DELIVERY_ACK" } }),
    ).toEqual([{ idExterno: "A1", estado: "ENTREGUE" }]);
    expect(interpretarWebhook({ event: "MESSAGES_UPDATE", data: [{ key: { id: "B" }, status: 4 }] })).toEqual([
      { idExterno: "B", estado: "LIDA" },
    ]);
    expect(interpretarWebhook({ event: "send.message", data: { key: { id: "C", fromMe: true }, status: "ERROR" } })[0]).toMatchObject(
      { idExterno: "C", estado: "FALHADA" },
    );
    expect(interpretarWebhook({ event: "messages.upsert", data: { key: { id: "D" }, status: "READ" } })).toEqual([]);
    expect(interpretarWebhook({ event: "messages.update", data: { keyId: "E", fromMe: false, status: "READ" } })).toEqual([]);
    expect(interpretarWebhook(null)).toEqual([]);
  });

  it("estado de entrega nunca recua", () => {
    expect(podeTransitar("ENVIADA", "ENTREGUE")).toBe(true);
    expect(podeTransitar("LIDA", "ENTREGUE")).toBe(false);
    expect(podeTransitar("ENTREGUE", "ENVIADA")).toBe(false);
    expect(podeTransitar("ENTREGUE", "FALHADA")).toBe(false);
    expect(podeTransitar("ENVIADA", "FALHADA")).toBe(true);
    expect(podeTransitar("CANCELADA", "LIDA")).toBe(false);
  });

  it("origem do lead e sugestões", () => {
    expect(origemLead({ utmSource: "facebook", utmCampaign: "out" })).toBe("facebook / out");
    expect(origemLead({ fbclid: "x" })).toContain("Facebook");
    expect(origemLead({ referrer: "https://www.google.com/search?q=a" })).toBe("www.google.com");
    expect(origemLead({})).toBe("Direto");
    expect(formatarSugestoes([])).toContain("catálogo");
  });
});

// ─── Integração ──────────────────────────────────────────────────────────────

const sufixo = Date.now().toString(36);
const ids: Record<string, string> = {};
const AGORA = instanteLocal("2031-03-10", "10:00");

async function apagarTenant(tenantId: string) {
  const w = { where: { tenantId } };
  await prisma.mensagem.deleteMany(w);
  await prisma.pagamento.deleteMany(w);
  await prisma.parcela.deleteMany(w);
  await prisma.matricula.deleteMany(w);
  await prisma.turma.deleteMany(w);
  await prisma.formacao.deleteMany(w);
  await prisma.formando.deleteMany(w);
  await prisma.modeloMensagem.deleteMany(w);
  await prisma.configuracaoCentro.deleteMany(w);
  await prisma.auditLog.deleteMany(w);
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
}

beforeAll(async () => {
  const t = await prisma.tenant.create({ data: { nome: "Centro Msg", slug: `msg-${sufixo}` } });
  const tenantId = (ids.tenant = t.id);
  await prisma.configuracaoCentro.create({ data: { tenantId, whatsappModo: "SIMULACAO", diasAposAtraso: [1, 7] } });
  const f = await prisma.formacao.create({
    data: { tenantId, nome: "Excel", slug: "excel", cargaHoraria: 20, preco: 3_000_000n, categoria: "TECNICA" },
  });
  await prisma.formacao.create({
    data: { tenantId, nome: "Liderança", slug: "lideranca", cargaHoraria: 12, preco: 2_500_000n, categoria: "COMPORTAMENTAL" },
  });
  const turma = await prisma.turma.create({ data: { tenantId, formacaoId: f.id, codigo: "EX-1", estado: "EM_CURSO" } });
  const formando = await prisma.formando.create({
    data: { tenantId, nome: "Maria João Silva", whatsapp: "+244923000111", dataNascimento: d("1990-03-10") },
  });
  ids.formando = formando.id;
  const m = await prisma.matricula.create({
    data: { tenantId, formandoId: formando.id, turmaId: turma.id, valorTotal: 400_000n, numParcelas: 4 },
  });
  ids.matricula = m.id;
  const venc = ["2031-03-01", "2031-03-09", "2031-03-12", "2031-04-10"];
  for (const [i, v] of venc.entries()) {
    const p = await prisma.parcela.create({
      data: { tenantId, matriculaId: m.id, numero: i + 1, valor: 100_000n, vencimento: d(v) },
    });
    ids[`p${i + 1}`] = p.id;
  }
  // 1.ª parcela paga
  await prisma.pagamento.create({
    data: {
      tenantId,
      formandoId: formando.id,
      matriculaId: m.id,
      valor: 100_000n,
      metodo: "MULTICAIXA",
      dataPagamento: d("2031-03-01"),
      alocacoes: { create: [{ parcelaId: ids.p1, valor: 100_000n }] },
    },
  });
});

afterAll(async () => {
  if (ids.tenant) await apagarTenant(ids.tenant);
  await prisma.$disconnect();
});

describe("agendador", () => {
  it("antes da hora de envio não agenda nada", async () => {
    const r = await agendarCentro(prisma, ids.tenant, instanteLocal("2031-03-10", "07:00"));
    expect(r).toEqual({ lembretes: 0, atrasos: 0, aniversarios: 0 });
  });

  it("gera lembrete, aviso de atraso e aniversário — e é idempotente", async () => {
    const r1 = await agendarCentro(prisma, ids.tenant, AGORA);
    expect(r1).toEqual({ lembretes: 1, atrasos: 1, aniversarios: 1 });
    const r2 = await agendarCentro(prisma, ids.tenant, instanteLocal("2031-03-10", "15:00"));
    expect(r2).toEqual({ lembretes: 0, atrasos: 0, aniversarios: 0 });

    const msgs = await prisma.mensagem.findMany({ where: { tenantId: ids.tenant }, orderBy: { tipo: "asc" } });
    expect(msgs.map((m) => m.tipo).sort()).toEqual(["ANIVERSARIO", "LEMBRETE_VENCIMENTO", "PARCELA_ATRASO"]);
    const lembrete = msgs.find((m) => m.tipo === "LEMBRETE_VENCIMENTO")!;
    expect(lembrete.parcelaId).toBe(ids.p3);
    expect(lembrete.texto).toContain("Maria");
    expect(lembrete.texto).toContain("12/03/2031");
    const atraso = msgs.find((m) => m.tipo === "PARCELA_ATRASO")!;
    expect(atraso.parcelaId).toBe(ids.p2);
    expect(atraso.chave).toBe(`atraso:${ids.p2}:1`);
    expect(atraso.texto).toMatch(/3[\s.]?000,00/); // dívida total 300 000,00 Kz
  });
});

describe("worker", () => {
  const estado: EstadoWorker = { ultimoEnvio: new Map() };

  it("modo simulação marca como enviadas", async () => {
    const r = await processarFila(prisma, estado, { agora: new Date(), apenasCentro: ids.tenant });
    expect(r.enviadas).toBe(3);
    const pend = await prisma.mensagem.count({ where: { tenantId: ids.tenant, estado: { not: "ENVIADA" } } });
    expect(pend).toBe(0);
  });

  it("Evolution: erro transitório reagenda, permanente falha, sucesso guarda o id", async () => {
    await prisma.configuracaoCentro.update({
      where: { tenantId: ids.tenant },
      data: {
        whatsappModo: "EVOLUTION",
        evolutionUrl: "http://evo.invalid",
        evolutionApiKey: cifrar("k"),
        evolutionInstancia: "i",
        intervaloEnvioSegundos: 1,
      },
    });
    const r0 = await enfileirar(prisma, {
      tenantId: ids.tenant,
      tipo: "MANUAL",
      destino: "923 000 222",
      texto: "Olá",
      chave: `t-${sufixo}`,
    });
    expect(r0).toBe("ENFILEIRADA");
    expect(await enfileirar(prisma, { tenantId: ids.tenant, tipo: "MANUAL", destino: "923000222", texto: "x", chave: `t-${sufixo}` })).toBe(
      "DUPLICADA",
    );
    expect(await enfileirar(prisma, { tenantId: ids.tenant, tipo: "MANUAL", destino: "123", texto: "x" })).toBe("NUMERO_INVALIDO");

    let t = Date.now() + 10_000;
    const r1 = await processarFila(prisma, estado, {
      agora: new Date(t),
      apenasCentro: ids.tenant,
      enviar: async () => {
        throw new ErroEnvio("Evolution API 503", false, 503);
      },
    });
    expect(r1.reagendadas).toBe(1);
    let m = await prisma.mensagem.findFirstOrThrow({ where: { tenantId: ids.tenant, chave: `t-${sufixo}` } });
    expect(m).toMatchObject({ estado: "PENDENTE", tentativas: 1, destino: "+244923000222" });
    expect(m.proximaTentativa.getTime()).toBe(t + 60_000);

    t += 61_000;
    const enviados: string[] = [];
    const r2 = await processarFila(prisma, estado, {
      agora: new Date(t),
      apenasCentro: ids.tenant,
      enviar: async (cfg, destino) => {
        enviados.push(`${cfg.instancia}:${destino}`);
        return "EVO-ID-1";
      },
    });
    expect(r2.enviadas).toBe(1);
    expect(enviados).toEqual(["i:+244923000222"]);
    m = await prisma.mensagem.findUniqueOrThrow({ where: { id: m.id } });
    expect(m).toMatchObject({ estado: "ENVIADA", idExterno: "EVO-ID-1", erro: null });

    // Erro permanente → FALHADA de imediato
    await enfileirar(prisma, { tenantId: ids.tenant, tipo: "MANUAL", destino: "923000333", texto: "y", chave: `p-${sufixo}` });
    t += 5_000;
    const r3 = await processarFila(prisma, estado, {
      agora: new Date(t),
      apenasCentro: ids.tenant,
      enviar: async () => {
        throw new ErroEnvio("Evolution API 400: número não existe", true, 400);
      },
    });
    expect(r3.falhadas).toBe(1);
    const f = await prisma.mensagem.findFirstOrThrow({ where: { tenantId: ids.tenant, chave: `p-${sufixo}` } });
    expect(f.estado).toBe("FALHADA");
    expect(f.erro).toContain("não existe");
  });

  it("webhook atualiza ENVIADA → ENTREGUE → LIDA sem recuar", async () => {
    const tid = ids.tenant;
    expect(await aplicarAtualizacoes(prisma, tid, [{ idExterno: "EVO-ID-1", estado: "ENTREGUE" }])).toBe(1);
    expect(await aplicarAtualizacoes(prisma, tid, [{ idExterno: "EVO-ID-1", estado: "ENVIADA" }])).toBe(0);
    expect(await aplicarAtualizacoes(prisma, tid, [{ idExterno: "EVO-ID-1", estado: "LIDA" }])).toBe(1);
    // Outro centro não consegue alterar mensagens deste
    expect(await aplicarAtualizacoes(prisma, "outro-centro", [{ idExterno: "EVO-ID-1", estado: "FALHADA" }])).toBe(0);
    const m = await prisma.mensagem.findFirstOrThrow({ where: { tenantId: tid, idExterno: "EVO-ID-1" } });
    expect(m.estado).toBe("LIDA");
    expect(m.entregueEm).not.toBeNull();
    expect(m.lidaEm).not.toBeNull();
  });
});

describe("eventos de pagamento", () => {
  it("confirmação e plano concluído com sugestões do catálogo", async () => {
    const tenantId = ids.tenant;
    await prisma.configuracaoCentro.update({ where: { tenantId }, data: { whatsappModo: "SIMULACAO" } });
    const pag = await prisma.pagamento.create({
      data: {
        tenantId,
        formandoId: ids.formando,
        matriculaId: ids.matricula,
        valor: 300_000n,
        metodo: "TRANSFERENCIA",
        dataPagamento: d("2031-03-10"),
        alocacoes: {
          create: [
            { parcelaId: ids.p2, valor: 100_000n },
            { parcelaId: ids.p3, valor: 100_000n },
            { parcelaId: ids.p4, valor: 100_000n },
          ],
        },
      },
    });
    await aoRegistarPagamento(prisma, { tenantId, pagamentoId: pag.id });
    await aoRegistarPagamento(prisma, { tenantId, pagamentoId: pag.id }); // idempotente

    const conf = await prisma.mensagem.findMany({ where: { tenantId, pagamentoId: pag.id }, orderBy: { createdAt: "asc" } });
    expect(conf.map((m) => m.tipo)).toEqual(["CONFIRMACAO_PAGAMENTO", "PLANO_CONCLUIDO"]);
    expect(conf[0].texto).toContain("Parcelas em falta: 0");
    expect(conf[1].texto).toContain("Liderança");
    expect(conf[1].texto).not.toContain("• Excel");
    expect(conf[1].proximaTentativa.getTime()).toBeGreaterThan(conf[0].proximaTentativa.getTime());

    // Lembretes pendentes de parcelas entretanto pagas são cancelados pelo worker
    await prisma.mensagem.create({
      data: { tenantId, tipo: "LEMBRETE_VENCIMENTO", destino: "+244923000111", texto: "x", parcelaId: ids.p4 },
    });
    const r = await processarFila(prisma, { ultimoEnvio: new Map() }, { agora: new Date(Date.now() + 120_000), apenasCentro: tenantId });
    expect(r.canceladas).toBe(1);
  });

  it("modelo personalizado inativo não é enviado", async () => {
    const tenantId = ids.tenant;
    await prisma.modeloMensagem.create({ data: { tenantId, tipo: "CONFIRMACAO_PAGAMENTO", texto: "x", ativo: false } });
    const antes = await prisma.mensagem.count({ where: { tenantId } });
    const pag = await prisma.pagamento.findFirstOrThrow({ where: { tenantId, valor: 300_000n } });
    await prisma.mensagem.deleteMany({ where: { tenantId, pagamentoId: pag.id } });
    await aoRegistarPagamento(prisma, { tenantId, pagamentoId: pag.id });
    const tipos = (await prisma.mensagem.findMany({ where: { tenantId, pagamentoId: pag.id } })).map((m) => m.tipo);
    expect(tipos).toEqual(["PLANO_CONCLUIDO"]);
    expect(await prisma.mensagem.count({ where: { tenantId } })).toBe(antes - 1);
  });
});
