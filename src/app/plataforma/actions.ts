"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarSessao, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { nomeInstanciaPadrao, obterConfiguracao } from "@/lib/mensagens/config";
import { cifrar } from "@/lib/segredos";
import {
  autenticadoSuperAdmin,
  gerarSlugCentro,
  iniciarSessaoSuperAdmin,
  terminarSessaoSuperAdmin,
  verificarChaveSuperAdmin,
} from "@/lib/superadmin";
import { campo, type EstadoForm } from "@/lib/utils";
import { errosZod } from "@/lib/validacao";

const CAMINHO = "/plataforma";

async function exigirSuperAdmin() {
  if (!(await autenticadoSuperAdmin())) {
    redirect(CAMINHO);
  }
}

export async function entrarSuperAdmin(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const chave = (fd.get("chave") as string | null) ?? "";
  if (!verificarChaveSuperAdmin(chave)) {
    return { erro: "Chave mestra inválida." };
  }
  await iniciarSessaoSuperAdmin();
  revalidatePath(CAMINHO);
  redirect(CAMINHO);
}

export async function sairSuperAdmin() {
  await terminarSessaoSuperAdmin();
  redirect(CAMINHO);
}

export type CredenciaisCentroCriado = {
  nomeCentro: string;
  slug: string;
  nomeAdmin: string;
  emailAdmin: string;
  passwordInicial: string;
  instanciaWhatsapp: string;
};

export type EstadoCriarCentro =
  | (NonNullable<EstadoForm> & {
      credenciais?: CredenciaisCentroCriado;
    })
  | undefined;

const esquemaNovoCentro = z.object({
  nomeCentro: z.string({ required_error: "Indique o nome do centro." }).min(2, "Mínimo de 2 caracteres.").max(150),
  slug: z
    .string({ required_error: "Indique o identificador (slug)." })
    .min(2, "Mínimo de 2 caracteres.")
    .max(50, "Máximo de 50 caracteres.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens (ex.: formarmais)."),
  nomeAdmin: z.string({ required_error: "Indique o nome do administrador." }).min(2, "Indique o nome.").max(150),
  emailAdmin: z.string({ required_error: "Indique o email." }).email("Email inválido.").max(150),
  passwordAdmin: z
    .string({ required_error: "Indique a palavra-passe inicial." })
    .min(8, "A palavra-passe tem de ter pelo menos 8 caracteres.")
    .max(200),
  whatsappModo: z.enum(["SIMULACAO", "EVOLUTION", "DESATIVADO"]).default("SIMULACAO"),
});

export async function criarCentro(_prev: EstadoCriarCentro, fd: FormData): Promise<EstadoCriarCentro> {
  await exigirSuperAdmin();

  const nomeCentro = campo(fd, "nomeCentro") ?? "";
  const slugBruto = campo(fd, "slug") || gerarSlugCentro(nomeCentro);

  const r = esquemaNovoCentro.safeParse({
    nomeCentro: nomeCentro || undefined,
    slug: slugBruto || undefined,
    nomeAdmin: campo(fd, "nomeAdmin") ?? undefined,
    emailAdmin: campo(fd, "emailAdmin")?.toLowerCase() ?? undefined,
    passwordAdmin: (fd.get("passwordAdmin") as string | null) || undefined,
    whatsappModo: campo(fd, "whatsappModo") ?? "SIMULACAO",
  });
  if (!r.success) {
    return { erro: "Verifique os campos assinalados.", erros: errosZod(r.error) };
  }

  const [slugExistente, emailExistente] = await Promise.all([
    prisma.tenant.findUnique({ where: { slug: r.data.slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: r.data.emailAdmin }, select: { id: true } }),
  ]);

  const erros: Record<string, string> = {};
  if (slugExistente) erros.slug = `Já existe um centro com o slug "${r.data.slug}".`;
  if (emailExistente) erros.emailAdmin = "Já existe um utilizador na plataforma com este email.";
  if (Object.keys(erros).length > 0) {
    return { erro: "Verifique os campos assinalados.", erros };
  }

  const instanciaWhatsapp = nomeInstanciaPadrao(r.data.slug);
  const passwordHash = await hashPassword(r.data.passwordAdmin);

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        nome: r.data.nomeCentro,
        slug: r.data.slug,
      },
    });
    await tx.configuracaoCentro.create({
      data: {
        tenantId: tenant.id,
        whatsappModo: r.data.whatsappModo,
        evolutionInstancia: instanciaWhatsapp,
      },
    });
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        nome: r.data.nomeAdmin,
        email: r.data.emailAdmin,
        passwordHash,
        perfil: "ADMIN",
        ativo: true,
      },
    });
  });

  revalidatePath(CAMINHO);
  return {
    ok: `Centro "${r.data.nomeCentro}" criado com sucesso! Copie as credenciais abaixo para enviar ao cliente.`,
    credenciais: {
      nomeCentro: r.data.nomeCentro,
      slug: r.data.slug,
      nomeAdmin: r.data.nomeAdmin,
      emailAdmin: r.data.emailAdmin,
      passwordInicial: r.data.passwordAdmin,
      instanciaWhatsapp,
    },
  };
}

export async function entrarComoAdminCentro(tenantId: string) {
  await exigirSuperAdmin();
  const admin = await prisma.user.findFirst({
    where: { tenantId, perfil: "ADMIN", ativo: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    redirect(`${CAMINHO}?erro=Sem+administrador+ativo+neste+centro`);
  }
  await criarSessao(admin.id);
  redirect("/painel");
}

export async function alterarEstadoCentro(
  tenantId: string,
  ativar: boolean,
  _prev: EstadoForm,
  _fd: FormData,
): Promise<EstadoForm> {
  void _fd;
  await exigirSuperAdmin();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nome: true } });
  if (!tenant) return { erro: "Centro não encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { tenantId }, data: { ativo: ativar } });
    if (!ativar) {
      await tx.userSession.deleteMany({ where: { user: { tenantId } } });
    }
  });

  revalidatePath(CAMINHO);
  return {
    ok: ativar
      ? `Centro "${tenant.nome}" reativado (utilizadores ativos).`
      : `Centro "${tenant.nome}" suspenso (utilizadores desativados e sessões terminadas).`,
  };
}

export async function redefinirAdminCentro(
  tenantId: string,
  _prev: EstadoForm,
  fd: FormData,
): Promise<EstadoForm> {
  await exigirSuperAdmin();
  const email = campo(fd, "email")?.toLowerCase();
  const nome = campo(fd, "nome") || "Administrador";
  const novaPass = (fd.get("password") as string | null) ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erros: { email: "Indique um email válido." } };
  }
  if (novaPass.length < 8) {
    return { erros: { password: "A palavra-passe tem de ter pelo menos 8 caracteres." } };
  }

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente && existente.tenantId !== tenantId) {
    return { erros: { email: "Este email já pertence a outro centro." } };
  }

  const passwordHash = await hashPassword(novaPass);
  if (existente) {
    await prisma.user.update({
      where: { id: existente.id },
      data: { passwordHash, perfil: "ADMIN", ativo: true },
    });
    await prisma.userSession.deleteMany({ where: { userId: existente.id } });
  } else {
    await prisma.user.create({
      data: { tenantId, nome, email, passwordHash, perfil: "ADMIN", ativo: true },
    });
  }

  revalidatePath(CAMINHO);
  return { ok: `Credenciais de ${email} definidas com sucesso (senha: ${novaPass}).` };
}

export async function guardarWhatsappCentroSuperAdmin(
  tenantId: string,
  _prev: EstadoForm,
  fd: FormData,
): Promise<EstadoForm> {
  await exigirSuperAdmin();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, nome: true } });
    if (!tenant) return { erro: "Centro não encontrado." };

    const cfg = await obterConfiguracao(prisma, tenantId);
    const modo = campo(fd, "whatsappModo");
    if (modo !== "DESATIVADO" && modo !== "SIMULACAO" && modo !== "EVOLUTION") {
      return { erro: "Modo inválido." };
    }
    const instancia = campo(fd, "evolutionInstancia") || cfg.evolutionInstancia || nomeInstanciaPadrao(tenant.slug);
    const evolutionUrl = campo(fd, "evolutionUrl");
    const novaChave = campo(fd, "evolutionApiKey");
    const limparChave = fd.get("removerApiKey") === "on";

    await prisma.configuracaoCentro.update({
      where: { tenantId },
      data: {
        whatsappModo: modo,
        evolutionInstancia: instancia,
        evolutionUrl: evolutionUrl || null,
        ...(novaChave ? { evolutionApiKey: cifrar(novaChave) } : limparChave ? { evolutionApiKey: null } : {}),
      },
    });

    revalidatePath(CAMINHO);
    return { ok: `Configuração WhatsApp de "${tenant.nome}" atualizada.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Erro ao guardar configuração." };
  }
}
