"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { exigir } from "@/lib/auth";
import { comoCliente } from "@/lib/mensagens/config";
import { enfileirar } from "@/lib/mensagens/enfileirar";

export async function enviarLinkPortalAction(
  tipo: "formador" | "formando",
  id: string,
  origin: string,
): Promise<{ ok?: string; erro?: string }> {
  const { user, db } = await exigir(tipo === "formador" ? "formadores:ver" : "formandos:ver");
  const base = (origin || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  if (tipo === "formador") {
    const f = await db.formador.findFirst({
      where: { id },
      select: { id: true, nome: true, telefone: true, portalToken: true },
    });
    if (!f) return { erro: "Formador não encontrado." };
    if (!f.telefone) {
      return { erro: "Este formador não tem número de telefone/WhatsApp registado." };
    }

    const url = `${base}/portal/formador/${f.portalToken}`;
    const texto = `Olá ${f.nome}! Aceda ao seu Portal do Formador (${user.tenant.nome}) para consultar a sua agenda, confirmar as horas lecionadas e acompanhar os seus honorários: ${url}`;

    const res = await enfileirar(comoCliente(db), {
      tenantId: user.tenantId,
      tipo: "MANUAL",
      destino: f.telefone,
      texto,
      refs: { criadaPorId: user.id },
      forcar: false,
    });

    if (res === "DESATIVADO") {
      return { erro: "O envio por WhatsApp está desativado nas configurações deste centro." };
    }
    if (res === "NUMERO_INVALIDO") {
      return { erro: "O número de telefone do formador não é um número de WhatsApp válido." };
    }

    revalidatePath("/mensagens");
    return { ok: "Link do Portal do Formador colocado na fila de WhatsApp." };
  }

  const f = await db.formando.findFirst({
    where: { id },
    select: { id: true, nome: true, whatsapp: true, portalToken: true },
  });
  if (!f) return { erro: "Formando não encontrado." };

  const url = `${base}/portal/formando/${f.portalToken}`;
  const texto = `Olá ${f.nome}! Aceda ao seu Portal do Formando (${user.tenant.nome}) para consultar os seus horários, estado das parcelas, pagamentos e pontos de indicação: ${url}`;

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
  return { ok: "Link do Portal do Formando colocado na fila de WhatsApp." };
}

export async function regenerarTokenPortalAction(
  tipo: "formador" | "formando",
  id: string,
): Promise<{ ok?: string; erro?: string }> {
  const { db } = await exigir(tipo === "formador" ? "formadores:ver" : "formandos:ver");
  const novoToken = randomBytes(16).toString("base64url");

  if (tipo === "formador") {
    const f = await db.formador.findFirst({ where: { id }, select: { id: true } });
    if (!f) return { erro: "Formador não encontrado." };
    await db.formador.update({
      where: { id: f.id },
      data: { portalToken: novoToken },
    });
    revalidatePath("/portais");
    revalidatePath(`/formadores/${f.id}`);
    return { ok: "Novo link secreto gerado (o link anterior deixou de funcionar)." };
  }

  const f = await db.formando.findFirst({ where: { id }, select: { id: true } });
  if (!f) return { erro: "Formando não encontrado." };
  await db.formando.update({
    where: { id: f.id },
    data: { portalToken: novoToken },
  });
  revalidatePath("/portais");
  revalidatePath(`/formandos/${f.id}`);
  return { ok: "Novo link secreto gerado (o link anterior deixou de funcionar)." };
}
