"use server";

import { revalidatePath } from "next/cache";
import { exigir } from "@/lib/auth";

/**
 * Ações sobre a fila de mensagens. Usam `updateMany` com o estado esperado no
 * filtro: só alteram mensagens do próprio centro e no estado correto (evita
 * corridas com o worker).
 */

function revalidar(id?: string) {
  revalidatePath("/mensagens");
  if (id) revalidatePath(`/mensagens/${id}`);
  revalidatePath("/painel");
}

export async function tentarDeNovo(id: string): Promise<void> {
  const { db } = await exigir("mensagens:gerir");
  await db.mensagem.updateMany({
    where: { id, estado: "FALHADA" },
    data: { estado: "PENDENTE", tentativas: 0, proximaTentativa: new Date(), erro: null },
  });
  revalidar(id);
}

export async function tentarDeNovoTodas(): Promise<void> {
  const { db } = await exigir("mensagens:gerir");
  await db.mensagem.updateMany({
    where: { estado: "FALHADA" },
    data: { estado: "PENDENTE", tentativas: 0, proximaTentativa: new Date(), erro: null },
  });
  revalidar();
}

export async function cancelarMensagem(id: string): Promise<void> {
  const { db } = await exigir("mensagens:gerir");
  await db.mensagem.updateMany({ where: { id, estado: "PENDENTE" }, data: { estado: "CANCELADA" } });
  revalidar(id);
}
