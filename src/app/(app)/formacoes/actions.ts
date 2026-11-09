"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { SLUG_VALIDO, slugify } from "@/lib/catalogo";
import { parseKz } from "@/lib/money";
import { campo, type EstadoForm } from "@/lib/utils";
import { eUnicidade, errosZod } from "@/lib/validacao";

const ERRO_SLUG = "Já existe outra formação com este slug neste centro. Escolha outro.";

const esquema = z.object({
  nome: z.string({ required_error: "Indique o nome da formação." }).min(2, "Indique o nome da formação.").max(150),
  slug: z
    .string({ required_error: "Slug inválido." })
    .min(1, "Não foi possível gerar o slug a partir do nome; indique-o manualmente.")
    .max(80, "Máximo de 80 caracteres.")
    .regex(SLUG_VALIDO, "Use apenas letras minúsculas, números e hífenes (ex.: excel-avancado)."),
  descricao: z.string().max(5000).nullable(),
  cargaHoraria: z
    .number({ invalid_type_error: "Indique a carga horária em horas." })
    .int("A carga horária tem de ser um número inteiro de horas.")
    .positive("A carga horária tem de ser maior que zero.")
    .max(10000),
  preco: z.bigint({ invalid_type_error: "Preço inválido (ex.: 150 000,00)." }).nonnegative("Preço inválido."),
  categoria: z.enum(["COMPORTAMENTAL", "TECNICA"], { errorMap: () => ({ message: "Escolha a categoria." }) }),
  ativa: z.boolean(),
});

export async function guardarFormacao(id: string | null, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("formacoes:editar");

  const nome = campo(fd, "nome");
  const slugTexto = campo(fd, "slug");
  const carga = campo(fd, "cargaHoraria");
  const precoTexto = campo(fd, "preco");
  const preco = parseKz(precoTexto);

  const r = esquema.safeParse({
    nome: nome ?? undefined,
    slug: slugTexto ? slugTexto.toLowerCase() : slugify(nome ?? ""),
    descricao: campo(fd, "descricao"),
    cargaHoraria: carga === null ? undefined : Number(carga),
    preco: preco ?? undefined,
    categoria: campo(fd, "categoria") ?? undefined,
    ativa: fd.get("ativa") === "on",
  });
  if (!r.success) {
    const erros = errosZod(r.error);
    if (erros.preco) erros.preco = precoTexto ? "Preço inválido (ex.: 150 000,00)." : "Indique o preço.";
    return { erros };
  }
  const dados = r.data;

  if (id) {
    const existe = await db.formacao.findFirst({ where: { id }, select: { id: true } });
    if (!existe) return { erro: "Formação não encontrada." };
  }
  const conflito = await db.formacao.findFirst({
    where: { slug: dados.slug, ...(id ? { NOT: { id } } : {}) },
    select: { nome: true },
  });
  if (conflito) return { erros: { slug: `${ERRO_SLUG} (usado por "${conflito.nome}")` } };

  let novoId = id;
  try {
    if (id) {
      await db.formacao.update({ where: { id }, data: dados });
    } else {
      const f = await db.formacao.create({ data: { ...dados, tenantId: user.tenantId }, select: { id: true } });
      novoId = f.id;
    }
  } catch (e) {
    if (eUnicidade(e)) return { erros: { slug: ERRO_SLUG } };
    throw e;
  }

  revalidatePath("/formacoes");
  if (id) {
    revalidatePath(`/formacoes/${id}`);
    return { ok: "Formação guardada." };
  }
  redirect(`/formacoes/${novoId}`);
}
