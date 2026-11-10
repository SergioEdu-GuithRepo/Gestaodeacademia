"use server";

import type { EstadoPresenca } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { dbTenant, prisma } from "@/lib/db";
import { horasSessao } from "@/lib/precos-formador";
import { campo } from "@/lib/utils";

const ESTADOS_PRESENCA_VALIDOS = new Set<EstadoPresenca>(["PRESENTE", "FALTA", "JUSTIFICADA"]);

export async function confirmarSessaoPortalAction(
  portalToken: string,
  sessaoId: string,
  fd: FormData,
): Promise<{ ok?: string; erro?: string }> {
  if (!portalToken || !sessaoId) {
    return { erro: "Dados de sessão inválidos." };
  }

  const formador = await prisma.formador.findUnique({
    where: { portalToken },
    select: { id: true, tenantId: true, ativo: true },
  });

  if (!formador || !formador.ativo) {
    return { erro: "Link de portal inválido ou formador inativo." };
  }

  const db = dbTenant({ tenantId: formador.tenantId });
  const sessao = await db.sessao.findFirst({
    where: { id: sessaoId, formadorId: formador.id },
    include: {
      turma: {
        select: {
          id: true,
          matriculas: {
            where: { estado: { not: "CANCELADA" } },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!sessao) {
    return { erro: "Sessão não encontrada." };
  }
  if (sessao.estado === "CANCELADA") {
    return { erro: "Esta sessão encontra-se cancelada e não pode ser confirmada." };
  }

  const horasTxt = campo(fd, "horasLecionadas");
  const duracao = horasSessao(sessao);
  const horas = horasTxt ? Number(horasTxt.replace(",", ".")) : duracao;

  if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
    return { erro: "Indique um número de horas válido (entre 0,5 e 24 h)." };
  }

  const notas = campo(fd, "notas");
  if (notas && notas.length > 1000) {
    return { erro: "O sumário/observações não pode exceder 1000 caracteres." };
  }

  const presencasRegistar: { matriculaId: string; estado: EstadoPresenca }[] = [];
  for (const mat of sessao.turma.matriculas) {
    const bruto = campo(fd, `presenca_${mat.id}`);
    if (!bruto) {
      presencasRegistar.push({ matriculaId: mat.id, estado: "PRESENTE" });
      continue;
    }
    if (!ESTADOS_PRESENCA_VALIDOS.has(bruto as EstadoPresenca)) {
      return { erro: "Estado de presença inválido na lista nominal." };
    }
    presencasRegistar.push({ matriculaId: mat.id, estado: bruto as EstadoPresenca });
  }

  await db.$transaction(async (tx) => {
    await tx.sessao.update({
      where: { id: sessao.id },
      data: {
        estado: "REALIZADA",
        horasLecionadas: horas.toFixed(2),
        notas: notas ?? null,
      },
    });

    for (const item of presencasRegistar) {
      await tx.presenca.upsert({
        where: {
          sessaoId_matriculaId: {
            sessaoId: sessao.id,
            matriculaId: item.matriculaId,
          },
        },
        create: {
          tenantId: formador.tenantId,
          sessaoId: sessao.id,
          matriculaId: item.matriculaId,
          estado: item.estado,
        },
        update: {
          estado: item.estado,
        },
      });
    }
  });

  revalidatePath(`/portal/formador/${portalToken}`);
  revalidatePath("/financeiro");
  revalidatePath(`/formadores/${formador.id}`);
  revalidatePath(`/turmas/${sessao.turmaId}`);
  revalidatePath("/inteligencia");
  revalidatePath("/agenda");
  revalidatePath("/painel");

  return {
    ok:
      presencasRegistar.length > 0
        ? "Sessão, horas lecionadas e chamada nominal guardadas com sucesso."
        : "Sessão e horas lecionadas confirmadas com sucesso.",
  };
}
