"use server";

import { revalidatePath } from "next/cache";
import { dbTenant, prisma } from "@/lib/db";
import { horasSessao } from "@/lib/precos-formador";
import { campo } from "@/lib/utils";

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

  await db.sessao.update({
    where: { id: sessao.id },
    data: {
      estado: "REALIZADA",
      horasLecionadas: horas.toFixed(2),
      notas: notas ?? null,
    },
  });

  revalidatePath(`/portal/formador/${portalToken}`);
  revalidatePath("/financeiro");
  revalidatePath(`/formadores/${formador.id}`);
  revalidatePath(`/turmas/${sessao.turmaId}`);
  revalidatePath("/agenda");
  revalidatePath("/painel");

  return { ok: "Sessão e horas lecionadas confirmadas com sucesso." };
}
