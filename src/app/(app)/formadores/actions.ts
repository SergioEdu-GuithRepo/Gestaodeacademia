"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { CRITERIOS } from "@/lib/avaliacoes";
import { parseKz } from "@/lib/money";
import { campo, type EstadoForm } from "@/lib/utils";
import { eUnicidade, errosZod } from "@/lib/validacao";

// ── Formador ──────────────────────────────────────────────────────────────────

const esquemaFormador = z.object({
  nome: z.string({ required_error: "Indique o nome do formador." }).min(2, "Indique o nome do formador.").max(150),
  email: z.string().email("Email inválido.").max(150).nullable(),
  telefone: z.string().max(30, "Telefone demasiado longo.").nullable(),
  notas: z.string().max(5000).nullable(),
  ativo: z.boolean(),
});

/** Lê um valor monetário opcional; devolve `undefined` se o texto for inválido. */
function kzOpcional(fd: FormData, nome: string): bigint | null | undefined {
  const t = campo(fd, nome);
  if (t === null) return null;
  const v = parseKz(t);
  return v === null || v < 0n ? undefined : v;
}

function ids(fd: FormData, nome: string): string[] {
  return [...new Set(fd.getAll(nome).filter((v): v is string => typeof v === "string" && v !== ""))];
}

export async function guardarFormador(id: string | null, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("formadores:editar");

  const r = esquemaFormador.safeParse({
    nome: campo(fd, "nome") ?? undefined,
    email: campo(fd, "email")?.toLowerCase() ?? null,
    telefone: campo(fd, "telefone"),
    notas: campo(fd, "notas"),
    ativo: fd.get("ativo") === "on",
  });
  const erros = r.success ? {} : errosZod(r.error);

  const precoHoraComportamental = kzOpcional(fd, "precoHoraComportamental");
  const precoHoraTecnica = kzOpcional(fd, "precoHoraTecnica");
  if (precoHoraComportamental === undefined) erros.precoHoraComportamental = "Valor inválido (ex.: 15 000,00).";
  if (precoHoraTecnica === undefined) erros.precoHoraTecnica = "Valor inválido (ex.: 15 000,00).";
  if (!r.success || Object.keys(erros).length > 0) return { erros };

  // Só aceita áreas/competências do próprio centro.
  const [areas, competencias] = await Promise.all([
    db.area.findMany({ where: { id: { in: ids(fd, "areas") } }, select: { id: true } }),
    db.competencia.findMany({ where: { id: { in: ids(fd, "competencias") } }, select: { id: true } }),
  ]);

  const dados = {
    ...r.data,
    precoHoraComportamental: precoHoraComportamental ?? null,
    precoHoraTecnica: precoHoraTecnica ?? null,
  };

  if (id) {
    const existe = await db.formador.findFirst({ where: { id }, select: { id: true } });
    if (!existe) return { erro: "Formador não encontrado." };
    await db.formador.update({
      where: { id },
      data: { ...dados, areas: { set: areas }, competencias: { set: competencias } },
    });
    revalidatePath("/formadores");
    revalidatePath(`/formadores/${id}`);
    return { ok: "Dados do formador guardados." };
  }

  const novo = await db.formador.create({
    data: { ...dados, tenantId: user.tenantId, areas: { connect: areas }, competencias: { connect: competencias } },
    select: { id: true },
  });
  revalidatePath("/formadores");
  redirect(`/formadores/${novo.id}`);
}

// ── Áreas e competências ──────────────────────────────────────────────────────

const nomeCurto = z
  .string({ required_error: "Indique o nome." })
  .min(2, "Indique o nome.")
  .max(100, "Máximo de 100 caracteres.");

export async function criarArea(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("formadores:editar");
  const r = z.object({ nome: nomeCurto }).safeParse({ nome: campo(fd, "nome") ?? undefined });
  if (!r.success) return { erros: errosZod(r.error) };
  try {
    await db.area.create({ data: { tenantId: user.tenantId, nome: r.data.nome } });
  } catch (e) {
    if (eUnicidade(e)) return { erros: { nome: "Já existe uma área com este nome." } };
    throw e;
  }
  revalidatePath("/formadores", "layout");
  return { ok: `Área "${r.data.nome}" criada.` };
}

export async function criarCompetencia(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("formadores:editar");
  const r = z.object({ nome: nomeCurto }).safeParse({ nome: campo(fd, "nome") ?? undefined });
  if (!r.success) return { erros: errosZod(r.error) };

  const areaId = campo(fd, "areaId");
  if (areaId) {
    const area = await db.area.findFirst({ where: { id: areaId }, select: { id: true } });
    if (!area) return { erros: { areaId: "Área inválida." } };
  }
  try {
    await db.competencia.create({ data: { tenantId: user.tenantId, nome: r.data.nome, areaId } });
  } catch (e) {
    if (eUnicidade(e)) return { erros: { nome: "Já existe uma competência com este nome." } };
    throw e;
  }
  revalidatePath("/formadores", "layout");
  return { ok: `Competência "${r.data.nome}" criada.` };
}

// ── Preços por formação ───────────────────────────────────────────────────────

export async function guardarPreco(formadorId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("formadores:precos");

  const formacaoId = campo(fd, "formacaoId");
  const texto = campo(fd, "precoHora");
  const precoHora = parseKz(texto);
  const erros: Record<string, string> = {};
  if (!formacaoId) erros.formacaoId = "Escolha a formação.";
  if (!texto) erros.precoHora = "Indique o valor/hora.";
  else if (precoHora === null || precoHora < 0n) erros.precoHora = "Valor inválido (ex.: 18 000,00).";
  if (Object.keys(erros).length > 0 || !formacaoId || precoHora === null) return { erros };

  const [formador, formacao] = await Promise.all([
    db.formador.findFirst({ where: { id: formadorId }, select: { id: true } }),
    db.formacao.findFirst({ where: { id: formacaoId }, select: { id: true } }),
  ]);
  if (!formador) return { erro: "Formador não encontrado." };
  if (!formacao) return { erros: { formacaoId: "Formação inválida." } };

  await db.precoFormadorFormacao.upsert({
    where: { formadorId_formacaoId: { formadorId, formacaoId } },
    create: { tenantId: user.tenantId, formadorId, formacaoId, precoHora },
    update: { precoHora },
  });
  revalidatePath(`/formadores/${formadorId}`);
  return { ok: "Preço guardado." };
}

export async function removerPreco(formadorId: string, precoId: string): Promise<void> {
  const { db } = await exigir("formadores:precos");
  await db.precoFormadorFormacao.deleteMany({ where: { id: precoId, formadorId } });
  revalidatePath(`/formadores/${formadorId}`);
}

// ── Avaliações ────────────────────────────────────────────────────────────────

const nota = z.coerce
  .number({ invalid_type_error: "Escolha uma nota de 1 a 5." })
  .int("Escolha uma nota de 1 a 5.")
  .min(1, "Escolha uma nota de 1 a 5.")
  .max(5, "Escolha uma nota de 1 a 5.");

const esquemaAvaliacao = z.object({
  dominioConteudo: nota,
  eticaProfissional: nota,
  cumprimentoHorarios: nota,
  enquadramentoExercicios: nota,
  capacidadeMotivar: nota,
  avaliadoPor: z.string().max(150).nullable(),
  comentario: z.string().max(5000).nullable(),
});

export async function adicionarAvaliacao(formadorId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("formadores:avaliar");

  const entrada: Record<string, unknown> = {
    avaliadoPor: campo(fd, "avaliadoPor") ?? user.nome,
    comentario: campo(fd, "comentario"),
  };
  for (const c of CRITERIOS) entrada[c.campo] = campo(fd, c.campo) ?? undefined;

  const r = esquemaAvaliacao.safeParse(entrada);
  if (!r.success) return { erros: errosZod(r.error) };

  const formador = await db.formador.findFirst({ where: { id: formadorId }, select: { id: true } });
  if (!formador) return { erro: "Formador não encontrado." };

  const turmaId = campo(fd, "turmaId");
  if (turmaId) {
    const turma = await db.turma.findFirst({ where: { id: turmaId }, select: { id: true } });
    if (!turma) return { erros: { turmaId: "Turma inválida." } };
  }

  await db.avaliacaoFormador.create({ data: { ...r.data, tenantId: user.tenantId, formadorId, turmaId } });
  revalidatePath("/formadores");
  revalidatePath(`/formadores/${formadorId}`);
  return { ok: "Avaliação registada." };
}
