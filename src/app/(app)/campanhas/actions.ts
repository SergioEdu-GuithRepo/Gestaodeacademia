"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { dataSimples, hojeLocal } from "@/lib/datas";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { enfileirar } from "@/lib/mensagens/enfileirar";
import { primeiroNome, renderizar } from "@/lib/mensagens/modelos";
import { parseKz } from "@/lib/money";
import { NOMES_MESES, validarCampanhaSazonal } from "@/lib/retencao";
import { campo, type EstadoForm } from "@/lib/utils";
import { VARIAVEIS_CAMPANHA, filtrarFormandosSegmento } from "./segmento";

const TIPOS = ["SAZONAL", "FIDELIZACAO", "SEGMENTADA"] as const;

const esquemaCampanha = z.object({
  nome: z.string({ required_error: "Indique o nome da campanha." }).min(2, "Indique o nome da campanha.").max(150),
  tipo: z.enum(TIPOS, { errorMap: () => ({ message: "Escolha o tipo de campanha." }) }),
  descontoPct: z.coerce
    .number({ invalid_type_error: "Indique uma percentagem inteira." })
    .int("Indique uma percentagem inteira.")
    .min(0, "Mínimo de 0%.")
    .max(50, "Máximo de 50%."),
  mesValidade: z.coerce.number().int().min(1).max(12).nullable(),
  anoValidade: z.coerce.number().int().min(2024).max(2100).nullable(),
  formacaoId: z.string().max(80).nullable(),
  filtroNivelInteresse: z.enum(["MUITO", "POUCO"]).nullable(),
  filtroMinFormacoes: z.coerce.number().int().min(0).max(100).nullable(),
  filtroMaxFormacoes: z.coerce.number().int().min(0).max(100).nullable(),
  filtroProfissao: z.string().max(100).nullable(),
  mensagemTexto: z
    .string({ required_error: "Escreva o texto da mensagem de WhatsApp." })
    .min(5, "Escreva o texto da mensagem de WhatsApp.")
    .max(4000, "Máximo de 4000 caracteres."),
});

function inteiroOpcional(fd: FormData, nome: string): number | null {
  const t = campo(fd, nome);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export async function criarCampanha(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("campanhas:editar");

  const intencaoTxt = campo(fd, "filtroIntencaoCompra");
  const filtroIntencaoCompra = intencaoTxt === "sim" ? true : intencaoTxt === "nao" ? false : null;

  const bruto = {
    nome: campo(fd, "nome") ?? undefined,
    tipo: campo(fd, "tipo") ?? undefined,
    descontoPct: campo(fd, "descontoPct") ?? 0,
    mesValidade: inteiroOpcional(fd, "mesValidade"),
    anoValidade: inteiroOpcional(fd, "anoValidade"),
    formacaoId: campo(fd, "formacaoId"),
    filtroNivelInteresse: campo(fd, "filtroNivelInteresse"),
    filtroMinFormacoes: inteiroOpcional(fd, "filtroMinFormacoes"),
    filtroMaxFormacoes: inteiroOpcional(fd, "filtroMaxFormacoes"),
    filtroProfissao: campo(fd, "filtroProfissao"),
    mensagemTexto: (typeof fd.get("mensagemTexto") === "string" ? (fd.get("mensagemTexto") as string) : "")
      .replace(/\r\n?/g, "\n")
      .trim(),
  };

  const r = esquemaCampanha.safeParse(bruto);
  const erros: Record<string, string> = {};
  if (!r.success) {
    for (const issue of r.error.issues) {
      const k = String(issue.path[0]);
      erros[k] ??= issue.message;
    }
  }

  const orcamentoTxt = campo(fd, "orcamentoMax");
  let orcamentoMax: bigint | null = null;
  if (orcamentoTxt) {
    orcamentoMax = parseKz(orcamentoTxt);
    if (orcamentoMax === null || orcamentoMax <= 0n) {
      erros.orcamentoMax = "Indique um valor de orçamento válido em Kz.";
    }
  }

  if (r.success) {
    const valSazonal = validarCampanhaSazonal({
      tipo: r.data.tipo,
      descontoPct: r.data.descontoPct,
      mesValidade: r.data.mesValidade,
      anoValidade: r.data.anoValidade,
    });
    if (!valSazonal.ok) {
      if (valSazonal.erro.includes("mês")) erros.mesValidade = valSazonal.erro;
      else if (valSazonal.erro.includes("ano")) erros.anoValidade = valSazonal.erro;
      else erros.descontoPct = valSazonal.erro;
    }

    if (
      r.data.filtroMinFormacoes !== null &&
      r.data.filtroMaxFormacoes !== null &&
      r.data.filtroMinFormacoes > r.data.filtroMaxFormacoes
    ) {
      erros.filtroMaxFormacoes = "O máximo de formações não pode ser inferior ao mínimo.";
    }

    const permitidas = new Set<string>(VARIAVEIS_CAMPANHA);
    const desconhecidas = [...new Set([...r.data.mensagemTexto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].filter(
      (v) => !permitidas.has(v),
    );
    if (desconhecidas.length > 0) {
      erros.mensagemTexto = `Variáveis desconhecidas: ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}.`;
    }
  }

  if (!r.success || Object.keys(erros).length > 0) {
    return { erro: "Verifique os campos assinalados.", erros };
  }

  const d = r.data;
  if (d.formacaoId) {
    const formacao = await db.formacao.findFirst({ where: { id: d.formacaoId }, select: { id: true } });
    if (!formacao) return { erros: { formacaoId: "Formação não encontrada." } };
  }

  const campanha = await db.campanha.create({
    data: {
      tenantId: user.tenantId,
      nome: d.nome,
      tipo: d.tipo,
      estado: "ATIVA",
      descontoPct: d.descontoPct,
      mesValidade: d.mesValidade,
      anoValidade: d.anoValidade,
      orcamentoMax,
      formacaoId: d.formacaoId,
      filtroNivelInteresse: d.filtroNivelInteresse,
      filtroMinFormacoes: d.filtroMinFormacoes,
      filtroMaxFormacoes: d.filtroMaxFormacoes,
      filtroProfissao: d.filtroProfissao,
      filtroIntencaoCompra,
      mensagemTexto: d.mensagemTexto,
      criadaPorId: user.id,
    },
    select: { id: true },
  });

  revalidatePath("/campanhas");
  revalidatePath("/matriculas/nova");
  redirect(`/campanhas/${campanha.id}`);
}

export async function dispararCampanhaWhatsapp(
  campanhaId: string,
  _prev: EstadoForm,
  _fd: FormData,
): Promise<EstadoForm> {
  void _fd;
  const { user, db } = await exigir("campanhas:editar");

  const campanha = await db.campanha.findFirst({
    where: { id: campanhaId },
    include: { formacao: { select: { nome: true } } },
  });
  if (!campanha) return { erro: "Campanha não encontrada." };
  if (campanha.estado === "ENCERRADA") {
    return { erro: "Não é possível disparar uma campanha encerrada. Reative-a primeiro." };
  }

  const cfg = await obterConfiguracao(comoCliente(db), user.tenantId);
  if (cfg.whatsappModo === "DESATIVADO") {
    return { erro: "O envio por WhatsApp está desativado nas configurações deste centro." };
  }

  const formandos = await db.formando.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      profissao: true,
      intencaoCompra: true,
      avaliacaoEquipa: true,
      matriculas: {
        select: {
          estado: true,
          createdAt: true,
          parcelas: {
            select: {
              valor: true,
              vencimento: true,
              alocacoes: { select: { valor: true } },
            },
          },
        },
      },
    },
  });

  const hoje = dataSimples(hojeLocal());
  const destinatarios = filtrarFormandosSegmento(formandos, campanha, hoje);
  if (destinatarios.length === 0) {
    return { erro: "Nenhum formando corresponde aos filtros de segmentação desta campanha." };
  }

  const mesNome =
    campanha.mesValidade && NOMES_MESES[campanha.mesValidade]
      ? NOMES_MESES[campanha.mesValidade]
      : NOMES_MESES[new Date().getUTCMonth() + 1] ?? "";
  const formacaoNome = campanha.formacao?.nome ?? "nossas formações";

  let enfileiradas = 0;
  let duplicadas = 0;
  let invalidos = 0;

  for (const f of destinatarios) {
    const texto = renderizar(campanha.mensagemTexto, {
      primeiroNome: primeiroNome(f.nome),
      nome: f.nome,
      campanha: campanha.nome,
      desconto: `${campanha.descontoPct}%`,
      formacao: formacaoNome,
      mes: mesNome,
      centro: user.tenant.nome,
    });

    const res = await enfileirar(comoCliente(db), {
      tenantId: user.tenantId,
      tipo: "CAMPANHA",
      destino: f.whatsapp,
      texto,
      chave: `campanha:${campanha.id}:${f.id}`,
      refs: {
        formandoId: f.id,
        campanhaId: campanha.id,
        criadaPorId: user.id,
      },
    });

    if (res === "ENFILEIRADA") enfileiradas += 1;
    else if (res === "DUPLICADA") duplicadas += 1;
    else if (res === "NUMERO_INVALIDO") invalidos += 1;
  }

  await db.campanha.update({
    where: { id: campanha.id },
    data: {
      totalDestinatarios: destinatarios.length,
      enviadaEm: new Date(),
      estado: "ENVIADA",
    },
  });

  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${campanha.id}`);
  revalidatePath("/mensagens");

  const detalhes: string[] = [`${enfileiradas} mensagem(ns) colocada(s) na fila`];
  if (duplicadas > 0) detalhes.push(`${duplicadas} já enviada(s) anteriormente`);
  if (invalidos > 0) detalhes.push(`${invalidos} número(s) inválido(s)`);
  return { ok: `Campanha disparada para ${destinatarios.length} destinatário(s): ${detalhes.join(" · ")}.` };
}

export async function repetirCampanhaNoutroMes(
  campanhaId: string,
  _prev: EstadoForm,
  fd: FormData,
): Promise<EstadoForm> {
  const { user, db } = await exigir("campanhas:editar");

  const original = await db.campanha.findFirst({ where: { id: campanhaId } });
  if (!original) return { erro: "Campanha original não encontrada." };

  const mesDestino = inteiroOpcional(fd, "mesValidade");
  if (!mesDestino || !Number.isInteger(mesDestino) || mesDestino < 1 || mesDestino > 12) {
    return { erro: "Escolha um mês válido (1 a 12) para repetir a campanha." };
  }

  const anoDestino = original.anoValidade ?? new Date().getUTCFullYear();
  if (original.mesValidade === mesDestino && original.anoValidade === anoDestino) {
    return { erro: "Escolha um mês diferente do mês da campanha atual." };
  }

  const nomeMes = NOMES_MESES[mesDestino] ?? String(mesDestino);
  const nomePersonalizado = campo(fd, "nome");
  const novoNome = nomePersonalizado || `${original.nome} (${nomeMes}/${anoDestino})`;

  const nova = await db.campanha.create({
    data: {
      tenantId: user.tenantId,
      nome: novoNome.slice(0, 150),
      tipo: original.tipo,
      estado: "ATIVA",
      descontoPct: original.descontoPct,
      mesValidade: mesDestino,
      anoValidade: anoDestino,
      orcamentoMax: original.orcamentoMax,
      formacaoId: original.formacaoId,
      filtroNivelInteresse: original.filtroNivelInteresse,
      filtroMinFormacoes: original.filtroMinFormacoes,
      filtroMaxFormacoes: original.filtroMaxFormacoes,
      filtroProfissao: original.filtroProfissao,
      filtroIntencaoCompra: original.filtroIntencaoCompra,
      mensagemTexto: original.mensagemTexto,
      criadaPorId: user.id,
    },
    select: { id: true },
  });

  revalidatePath("/campanhas");
  revalidatePath("/matriculas/nova");
  redirect(`/campanhas/${nova.id}`);
}

export async function alterarEstadoCampanha(
  campanhaId: string,
  novoEstado: "ATIVA" | "ENCERRADA",
  _prev: EstadoForm,
  _fd: FormData,
): Promise<EstadoForm> {
  void _fd;
  const { db } = await exigir("campanhas:editar");

  const existente = await db.campanha.findFirst({ where: { id: campanhaId }, select: { id: true } });
  if (!existente) return { erro: "Campanha não encontrada." };

  await db.campanha.update({
    where: { id: existente.id },
    data: { estado: novoEstado },
  });

  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${campanhaId}`);
  revalidatePath("/matriculas/nova");

  return {
    ok: novoEstado === "ENCERRADA" ? "Campanha encerrada." : "Campanha reativada com sucesso.",
  };
}
