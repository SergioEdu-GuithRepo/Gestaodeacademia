"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dbTenant, prisma } from "@/lib/db";
import { extrairIp, hashIp, LIMITE_LEADS_POR_IP_HORA } from "@/lib/leads";
import { comoCliente } from "@/lib/mensagens/config";
import { aoCriarLead } from "@/lib/mensagens/eventos";
import { campo, normalizarWhatsapp, type EstadoForm } from "@/lib/utils";

const esquema = z.object({
  nome: z.string({ required_error: "Indique o seu nome." }).min(2, "Indique o seu nome completo.").max(120),
  whatsapp: z.string({ required_error: "Indique o seu número de WhatsApp." }),
  email: z.string().email("Email inválido.").max(120).nullable(),
  profissao: z.string().max(100).nullable(),
  turmaId: z.string({ required_error: "Escolha a turma pretendida." }).min(1, "Escolha a turma pretendida."),
  aceitouPreco: z.boolean(),
  aceitouDatas: z.boolean(),
});

function limparParametro(fd: FormData, nome: string, max = 120): string | null {
  const v = campo(fd, nome);
  return v ? v.slice(0, max) : null;
}

export async function submeterPreCadastro(
  centroSlug: string,
  formacaoSlug: string,
  _prev: EstadoForm,
  fd: FormData,
): Promise<EstadoForm> {
  // Honeypot anti-spam: se preenchido, finge sucesso sem gravar.
  if (campo(fd, "website")) {
    redirect(`/p/${centroSlug}/${formacaoSlug}/obrigado`);
  }

  const bruto = {
    nome: campo(fd, "nome") ?? undefined,
    whatsapp: campo(fd, "whatsapp") ?? undefined,
    email: campo(fd, "email")?.toLowerCase() ?? null,
    profissao: campo(fd, "profissao"),
    turmaId: campo(fd, "turmaId") ?? undefined,
    aceitouPreco: fd.get("aceitouPreco") === "on",
    aceitouDatas: fd.get("aceitouDatas") === "on",
  };

  const r = esquema.safeParse(bruto);
  const erros: Record<string, string> = {};
  if (!r.success) {
    for (const i of r.error.issues) erros[String(i.path[0])] ??= i.message;
  }

  const whatsapp = bruto.whatsapp ? normalizarWhatsapp(bruto.whatsapp) : null;
  if (!bruto.whatsapp) erros.whatsapp = "Indique o seu número de WhatsApp.";
  else if (!whatsapp) erros.whatsapp = "Número inválido. Use, por ex., 923 000 000 ou +244 923 000 000.";

  if (!bruto.aceitouPreco) {
    erros.aceitouPreco = "Confirme que aceita o preço da formação para concluir o pré-cadastro.";
  }
  if (!bruto.aceitouDatas) {
    erros.aceitouDatas = "Confirme a sua disponibilidade nas datas e horários da turma.";
  }

  if (!r.success || Object.keys(erros).length > 0 || !whatsapp) {
    return { erro: "Verifique os campos assinalados antes de enviar.", erros };
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: centroSlug }, select: { id: true } });
  if (!tenant) return { erro: "Centro de formação não encontrado." };

  const db = dbTenant({ tenantId: tenant.id });
  const formacao = await db.formacao.findFirst({
    where: { slug: formacaoSlug, ativa: true },
    select: { id: true, preco: true },
  });
  if (!formacao) return { erro: "Formação não disponível." };

  const turma = await db.turma.findFirst({
    where: {
      id: r.data.turmaId,
      formacaoId: formacao.id,
      estado: { in: ["PLANEADA", "EM_CURSO"] },
    },
    select: { id: true, preco: true },
  });
  if (!turma) {
    return { erro: "A turma selecionada já não está disponível.", erros: { turmaId: "Escolha uma turma disponível." } };
  }

  const h = await headers();
  const ipHash = hashIp(extrairIp(h.get("x-forwarded-for"), h.get("x-real-ip")));
  if (ipHash) {
    const recentes = await db.lead.count({
      where: { ipHash, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (recentes >= LIMITE_LEADS_POR_IP_HORA) {
      return { erro: "Recebemos vários pedidos recentes deste dispositivo. Por favor aguarde alguns minutos." };
    }
  }

  const formandoExistente = await db.formando.findFirst({
    where: { whatsapp },
    select: { id: true },
  });

  const precoApresentado = turma.preco ?? formacao.preco;
  const d = r.data;

  await db.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        tenantId: tenant.id,
        nome: d.nome,
        whatsapp,
        email: d.email,
        profissao: d.profissao,
        formacaoId: formacao.id,
        turmaId: turma.id,
        precoApresentado,
        aceitouPreco: true,
        aceitouDatas: true,
        formandoId: formandoExistente?.id ?? null,
        utmSource: limparParametro(fd, "utm_source"),
        utmMedium: limparParametro(fd, "utm_medium"),
        utmCampaign: limparParametro(fd, "utm_campaign"),
        utmContent: limparParametro(fd, "utm_content"),
        utmTerm: limparParametro(fd, "utm_term"),
        fbclid: limparParametro(fd, "fbclid"),
        referrer: limparParametro(fd, "referrer", 300),
        ipHash,
      },
      select: { id: true },
    });

    await aoCriarLead(comoCliente(tx), { tenantId: tenant.id, leadId: lead.id });
  });

  revalidatePath("/leads");
  revalidatePath("/mensagens");
  redirect(`/p/${centroSlug}/${formacaoSlug}/obrigado`);
}
