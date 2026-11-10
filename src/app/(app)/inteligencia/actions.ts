"use server";

import type { CanalEntregaRelatorio, TipoRelatorioIA } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { exigir } from "@/lib/auth";
import { urlBase } from "@/lib/configuracoes";
import { gerarEEntregarRelatorio, reenviarRelatorioExistente } from "@/lib/ia/entrega";
import { pode } from "@/lib/rbac";
import { campo, type EstadoForm } from "@/lib/utils";

const TIPOS_VALIDOS: readonly TipoRelatorioIA[] = [
  "SEMANAL_COMERCIAL",
  "MENSAL_FINANCEIRO",
  "POR_FORMACAO",
  "POR_FORMADOR",
  "ALERTA_IMEDIATO",
];

const CANAIS_VALIDOS: readonly CanalEntregaRelatorio[] = [
  "APENAS_SISTEMA",
  "WHATSAPP",
  "EMAIL",
  "AMBOS",
];

function obterUrlBase(h: Awaited<ReturnType<typeof headers>>): string {
  return urlBase(
    process.env.APP_BASE_URL,
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto"),
  );
}

export async function gerarRelatorioIaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user } = await exigir("inteligencia:ver");

  const tipo = (campo(fd, "tipo") ?? "SEMANAL_COMERCIAL") as TipoRelatorioIA;
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return { erro: "Selecione um tipo de relatório válido." };
  }

  // Controlo por perfil: relatórios financeiros apenas para ADMIN ou FINANCEIRO
  if (tipo === "MENSAL_FINANCEIRO" && !pode(user.perfil, "financeiro:ver")) {
    return { erro: "O seu perfil não tem permissão para gerar relatórios financeiros." };
  }
  if (tipo === "SEMANAL_COMERCIAL" && user.perfil !== "ADMIN" && !pode(user.perfil, "leads:ver")) {
    return { erro: "O seu perfil não tem permissão para gerar relatórios comerciais." };
  }

  const canal = (campo(fd, "canal") ?? "APENAS_SISTEMA") as CanalEntregaRelatorio;
  if (!CANAIS_VALIDOS.includes(canal)) {
    return { erro: "Canal de entrega inválido." };
  }

  const formacaoId = campo(fd, "formacaoId");
  const formadorId = campo(fd, "formadorId");

  if (tipo === "POR_FORMACAO" && !formacaoId) {
    return { erros: { formacaoId: "Escolha a formação a analisar." } };
  }
  if (tipo === "POR_FORMADOR" && !formadorId) {
    return { erros: { formadorId: "Escolha o formador a analisar." } };
  }

  let criadoId: string | null = null;
  try {
    const base = obterUrlBase(await headers());
    const res = await gerarEEntregarRelatorio({
      tenantId: user.tenantId,
      tipo,
      formacaoId: tipo === "POR_FORMACAO" ? formacaoId : null,
      formadorId: tipo === "POR_FORMADOR" ? formadorId : null,
      canalOverride: canal,
      geradoPorId: user.id,
      urlBaseApp: base,
      forcarAlertaManual: true,
    });
    criadoId = res.relatorio?.id ?? null;
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível gerar o relatório." };
  }

  revalidatePath("/inteligencia");
  if (criadoId) {
    redirect(`/inteligencia/${criadoId}`);
  }
  return { ok: "Verificação concluída." };
}

export async function reenviarRelatorioIaAction(
  relatorioId: string,
  canal: "WHATSAPP" | "EMAIL" | "AMBOS",
  _prev: EstadoForm,
  _fd: FormData,
): Promise<EstadoForm> {
  void _fd;
  const { user } = await exigir("inteligencia:ver");
  const base = obterUrlBase(await headers());
  const r = await reenviarRelatorioExistente({
    tenantId: user.tenantId,
    relatorioId,
    canal,
    userId: user.id,
    urlBaseApp: base,
  });
  revalidatePath(`/inteligencia/${relatorioId}`);
  revalidatePath("/inteligencia");
  return r;
}
