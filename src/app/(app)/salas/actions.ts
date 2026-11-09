"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { campo, type EstadoForm } from "@/lib/utils";
import { eUnicidade, errosZod } from "@/lib/validacao";

const esquema = z.object({
  nome: z.string({ required_error: "Indique o nome da sala." }).min(1, "Indique o nome da sala.").max(100),
  capacidade: z
    .number({ invalid_type_error: "Capacidade inválida." })
    .int("Capacidade inválida.")
    .positive("A capacidade tem de ser maior que zero.")
    .max(10000)
    .nullable(),
  ativa: z.boolean(),
});

export async function guardarSala(id: string | null, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("formacoes:editar");

  const cap = campo(fd, "capacidade");
  const r = esquema.safeParse({
    nome: campo(fd, "nome") ?? undefined,
    capacidade: cap === null ? null : Number(cap),
    ativa: fd.get("ativa") === "on",
  });
  if (!r.success) return { erros: errosZod(r.error) };

  try {
    if (id) {
      const existe = await db.sala.findFirst({ where: { id }, select: { id: true } });
      if (!existe) return { erro: "Sala não encontrada." };
      await db.sala.update({ where: { id }, data: r.data });
    } else {
      await db.sala.create({ data: { ...r.data, tenantId: user.tenantId } });
    }
  } catch (e) {
    if (eUnicidade(e)) return { erros: { nome: "Já existe uma sala com este nome." } };
    throw e;
  }

  revalidatePath("/salas");
  redirect("/salas");
}
