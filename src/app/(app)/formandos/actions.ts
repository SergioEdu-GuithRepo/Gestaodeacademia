"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { dataSimples, hojeLocal } from "@/lib/datas";
import { comoCliente } from "@/lib/mensagens/config";
import { enfileirar } from "@/lib/mensagens/enfileirar";
import { campo, normalizarWhatsapp, type EstadoForm } from "@/lib/utils";

const esquema = z.object({
  nome: z.string({ required_error: "Indique o nome." }).min(2, "Indique o nome completo.").max(120),
  profissao: z.string().max(80).nullable(),
  whatsapp: z.string({ required_error: "O WhatsApp é obrigatório." }),
  email: z.string().email("Email inválido.").max(120).nullable(),
  dataNascimento: z.string().nullable(),
  intencaoCompra: z.boolean(),
  formaPagamentoPreferida: z.enum(["PRONTO", "PARCELADO"]).nullable(),
  avaliacaoEquipa: z.coerce.number().int().min(1).max(5).nullable(),
  indicadoPorId: z.string().max(80).nullable(),
  notas: z.string().max(2000).nullable(),
});

type Resultado =
  | { ok: true; dados: Omit<Prisma.FormandoUncheckedCreateInput, "tenantId"> }
  | { ok: false; estado: EstadoForm };

function lerFormulario(fd: FormData): Resultado {
  const bruto = {
    nome: campo(fd, "nome") ?? undefined,
    profissao: campo(fd, "profissao"),
    whatsapp: campo(fd, "whatsapp") ?? undefined,
    email: campo(fd, "email")?.toLowerCase() ?? null,
    dataNascimento: campo(fd, "dataNascimento"),
    intencaoCompra: fd.get("intencaoCompra") === "on",
    formaPagamentoPreferida: campo(fd, "formaPagamentoPreferida"),
    avaliacaoEquipa: campo(fd, "avaliacaoEquipa"),
    indicadoPorId: campo(fd, "indicadoPorId"),
    notas: campo(fd, "notas"),
  };
  const r = esquema.safeParse(bruto);
  const erros: Record<string, string> = {};
  if (!r.success) {
    for (const issue of r.error.issues) {
      const k = String(issue.path[0]);
      erros[k] ??= issue.message;
    }
  }

  const whatsapp = bruto.whatsapp ? normalizarWhatsapp(bruto.whatsapp) : null;
  if (!bruto.whatsapp) erros.whatsapp = "O WhatsApp é obrigatório.";
  else if (!whatsapp) erros.whatsapp = "Número inválido. Use, por ex., 923 000 000 ou +244 923 000 000.";

  let dataNascimento: Date | null = null;
  if (bruto.dataNascimento) {
    try {
      dataNascimento = dataSimples(bruto.dataNascimento);
      if (dataNascimento > dataSimples(hojeLocal())) erros.dataNascimento = "A data não pode ser futura.";
    } catch {
      erros.dataNascimento = "Data inválida.";
    }
  }

  if (!r.success || Object.keys(erros).length > 0 || !whatsapp) {
    return { ok: false, estado: { erro: "Verifique os campos assinalados.", erros } };
  }
  const d = r.data;
  return {
    ok: true,
    dados: {
      nome: d.nome,
      profissao: d.profissao,
      whatsapp,
      email: d.email,
      dataNascimento,
      intencaoCompra: d.intencaoCompra,
      formaPagamentoPreferida: d.formaPagamentoPreferida,
      avaliacaoEquipa: d.avaliacaoEquipa,
      indicadoPorId: d.indicadoPorId,
      notas: d.notas,
    },
  };
}

function erroDuplicado(e: unknown): EstadoForm | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return {
      erro: "Já existe um formando com este número de WhatsApp neste centro.",
      erros: { whatsapp: "Número já registado." },
    };
  }
  return null;
}

export async function criarFormando(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("formandos:editar");
  const r = lerFormulario(fd);
  if (!r.ok) return r.estado;

  if (r.dados.indicadoPorId) {
    const ind = await db.formando.findFirst({ where: { id: r.dados.indicadoPorId }, select: { id: true } });
    if (!ind) return { erros: { indicadoPorId: "Formando indicador não encontrado." } };
  }

  let id: string;
  try {
    const f = await db.formando.create({ data: { ...r.dados, tenantId: user.tenantId } });
    id = f.id;
  } catch (e) {
    const dup = erroDuplicado(e);
    if (dup) return dup;
    throw e;
  }
  revalidatePath("/formandos");
  if (r.dados.indicadoPorId) revalidatePath(`/formandos/${r.dados.indicadoPorId}`);
  redirect(`/formandos/${id}`);
}

export async function editarFormando(id: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { db } = await exigir("formandos:editar");
  const r = lerFormulario(fd);
  if (!r.ok) return r.estado;

  if (r.dados.indicadoPorId) {
    if (r.dados.indicadoPorId === id) {
      return { erros: { indicadoPorId: "Um formando não pode indicar-se a si próprio." } };
    }
    const ind = await db.formando.findFirst({ where: { id: r.dados.indicadoPorId }, select: { id: true } });
    if (!ind) return { erros: { indicadoPorId: "Formando indicador não encontrado." } };
  }

  try {
    await db.formando.update({ where: { id }, data: r.dados });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { erro: "Formando não encontrado." };
    }
    const dup = erroDuplicado(e);
    if (dup) return dup;
    throw e;
  }
  revalidatePath("/formandos");
  revalidatePath(`/formandos/${id}`);
  if (r.dados.indicadoPorId) revalidatePath(`/formandos/${r.dados.indicadoPorId}`);
  redirect(`/formandos/${id}`);
}

export async function enviarMensagemManual(formandoId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("mensagens:gerir");
  const texto = (typeof fd.get("texto") === "string" ? (fd.get("texto") as string) : "").replace(/\r\n?/g, "\n").trim();
  if (!texto) return { erros: { texto: "Escreva a mensagem." } };
  if (texto.length > 2000) return { erros: { texto: "Máximo de 2000 caracteres." } };

  const f = await db.formando.findFirst({ where: { id: formandoId }, select: { id: true, whatsapp: true } });
  if (!f) return { erro: "Formando não encontrado." };

  const res = await enfileirar(comoCliente(db), {
    tenantId: user.tenantId,
    tipo: "MANUAL",
    destino: f.whatsapp,
    texto,
    refs: { formandoId: f.id, criadaPorId: user.id },
    forcar: false,
  });

  if (res === "DESATIVADO") {
    return { erro: "O envio por WhatsApp está desativado nas configurações deste centro." };
  }
  if (res === "NUMERO_INVALIDO") {
    return { erro: "O número de WhatsApp do formando é inválido." };
  }

  revalidatePath(`/formandos/${f.id}`);
  revalidatePath("/mensagens");
  return { ok: "Mensagem colocada na fila de envio." };
}
