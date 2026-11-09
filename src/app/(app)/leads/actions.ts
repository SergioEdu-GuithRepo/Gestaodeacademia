"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigir } from "@/lib/auth";
import { campo, type EstadoForm } from "@/lib/utils";

function revalidar(id: string) {
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/painel");
}

export async function marcarEstadoLead(
  leadId: string,
  estado: "NOVO" | "CONTACTADO" | "PERDIDO",
  _prev: EstadoForm,
  _fd: FormData,
): Promise<EstadoForm> {
  void _fd;
  const { db } = await exigir("leads:editar");
  const atual = await db.lead.findFirst({ where: { id: leadId }, select: { id: true, contactadoEm: true } });
  if (!atual) return { erro: "Lead não encontrado." };

  await db.lead.update({
    where: { id: atual.id },
    data: {
      estado,
      ...(estado === "CONTACTADO" && !atual.contactadoEm ? { contactadoEm: new Date() } : {}),
    },
  });
  revalidar(atual.id);
  return { ok: "Estado atualizado." };
}

export async function guardarNotasLead(leadId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { db } = await exigir("leads:editar");
  const notas = campo(fd, "notas");
  if (notas && notas.length > 2000) return { erros: { notas: "Máximo de 2000 caracteres." } };

  const atual = await db.lead.findFirst({ where: { id: leadId }, select: { id: true } });
  if (!atual) return { erro: "Lead não encontrado." };

  await db.lead.update({ where: { id: atual.id }, data: { notas } });
  revalidar(atual.id);
  return { ok: "Notas guardadas." };
}

export async function converterLeadEmFormando(
  leadId: string,
  _prev: EstadoForm,
  _fd: FormData,
): Promise<EstadoForm> {
  void _fd;
  const { user, db } = await exigir("leads:editar");

  const lead = await db.lead.findFirst({
    where: { id: leadId },
    select: {
      id: true,
      nome: true,
      whatsapp: true,
      email: true,
      profissao: true,
      turmaId: true,
      formandoId: true,
      contactadoEm: true,
    },
  });
  if (!lead) return { erro: "Lead não encontrado." };

  const formandoId = await db.$transaction(async (tx) => {
    let fId = lead.formandoId;
    if (fId) {
      const existe = await tx.formando.findFirst({ where: { id: fId }, select: { id: true } });
      if (!existe) fId = null;
    }
    if (!fId) {
      const porWhatsapp = await tx.formando.findFirst({
        where: { whatsapp: lead.whatsapp },
        select: { id: true },
      });
      if (porWhatsapp) {
        fId = porWhatsapp.id;
      } else {
        try {
          const criado = await tx.formando.create({
            data: {
              tenantId: user.tenantId,
              nome: lead.nome,
              whatsapp: lead.whatsapp,
              email: lead.email,
              profissao: lead.profissao,
              intencaoCompra: true,
            },
            select: { id: true },
          });
          fId = criado.id;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            const dup = await tx.formando.findFirstOrThrow({
              where: { whatsapp: lead.whatsapp },
              select: { id: true },
            });
            fId = dup.id;
          } else {
            throw e;
          }
        }
      }
    }

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        estado: "CONVERTIDO",
        formandoId: fId,
        contactadoEm: lead.contactadoEm ?? new Date(),
      },
    });

    return fId;
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/formandos");
  const destino = `/matriculas/nova?formandoId=${formandoId}${lead.turmaId ? `&turmaId=${lead.turmaId}` : ""}`;
  redirect(destino);
}
