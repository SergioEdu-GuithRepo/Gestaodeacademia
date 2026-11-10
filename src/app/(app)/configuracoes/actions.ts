"use server";

import { randomUUID } from "node:crypto";
import type { Perfil } from "@prisma/client";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigir, hashPassword } from "@/lib/auth";
import { parseDiasAposAtraso, parseNumerosEquipa, urlBase } from "@/lib/configuracoes";
import { comoCliente, configEvolution, nomeInstanciaPadrao, obterConfiguracao, temEvolutionGlobal } from "@/lib/mensagens/config";
import { MODELOS_PADRAO, TIPOS_MODELO, type TipoModelo } from "@/lib/mensagens/modelos";
import { cifrar } from "@/lib/segredos";
import { desligarInstancia, enviarTexto, estadoConexao, obterQrOuCriarInstancia } from "@/lib/whatsapp/evolution";
import { campo, normalizarWhatsapp, type EstadoForm } from "@/lib/utils";
import { eUnicidade, errosZod } from "@/lib/validacao";

const CAMINHO = "/configuracoes";

/** Garante que a configuração existe e devolve-a. */
async function configuracao() {
  const { user, db } = await exigir("configuracoes:editar");
  const cfg = await obterConfiguracao(comoCliente(db), user.tenantId);
  return { user, db, cfg };
}

function inteiro(fd: FormData, nome: string): number | undefined {
  const t = campo(fd, nome);
  if (t === null || !/^-?\d+$/.test(t)) return undefined;
  return Number(t);
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────

const esquemaWhatsapp = z.object({
  whatsappModo: z.enum(["DESATIVADO", "SIMULACAO", "EVOLUTION"], {
    errorMap: () => ({ message: "Escolha o modo de funcionamento." }),
  }),
  evolutionUrl: z
    .string()
    .max(300, "URL demasiado longo.")
    .url("URL inválido (ex.: https://evolution.exemplo.ao).")
    .refine((u) => /^https?:\/\//i.test(u), "O URL tem de começar por http:// ou https://.")
    .nullable(),
  evolutionInstancia: z.string().max(100, "Nome demasiado longo.").nullable(),
  intervaloEnvioSegundos: z
    .number({ required_error: "Indique o intervalo.", invalid_type_error: "Indique um número inteiro." })
    .int("Indique um número inteiro.")
    .min(1, "Mínimo de 1 segundo.")
    .max(120, "Máximo de 120 segundos."),
});

export async function guardarWhatsapp(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db, cfg } = await configuracao();

  const urlCampo = campo(fd, "evolutionUrl");
  const instCampo = campo(fd, "evolutionInstancia");

  const r = esquemaWhatsapp.safeParse({
    whatsappModo: campo(fd, "whatsappModo") ?? undefined,
    evolutionUrl: urlCampo !== null ? urlCampo : cfg.evolutionUrl,
    evolutionInstancia:
      instCampo !== null
        ? instCampo
        : cfg.evolutionInstancia ?? nomeInstanciaPadrao(user.tenant.slug),
    intervaloEnvioSegundos: inteiro(fd, "intervaloEnvioSegundos"),
  });
  const erros = r.success ? {} : errosZod(r.error);

  const novaChave = campo(fd, "evolutionApiKey");
  const remover = fd.get("removerApiKey") === "on";
  if (novaChave && novaChave.length > 500) erros.evolutionApiKey = "Chave demasiado longa.";
  const ficaComChavePropria = novaChave ? true : remover ? false : !!cfg.evolutionApiKey;
  const globalDisponivel = temEvolutionGlobal();

  if (r.success && r.data.whatsappModo === "EVOLUTION" && !globalDisponivel) {
    if (!r.data.evolutionUrl) {
      erros.evolutionUrl ??= "Defina EVOLUTION_API_URL no servidor ou preencha o URL nas opções técnicas.";
    }
    if (!r.data.evolutionInstancia) {
      erros.evolutionInstancia ??= "Indique o nome da instância.";
    }
    if (!ficaComChavePropria) {
      erros.evolutionApiKey ??= "Defina EVOLUTION_API_KEY no servidor ou preencha a chave API nas opções técnicas.";
    }
  }
  if (!r.success || Object.keys(erros).length > 0) return { erro: "Verifique os campos assinalados.", erros };

  await db.configuracaoCentro.update({
    where: { tenantId: user.tenantId },
    data: {
      ...r.data,
      evolutionInstancia: r.data.evolutionInstancia || nomeInstanciaPadrao(user.tenant.slug),
      ...(novaChave ? { evolutionApiKey: cifrar(novaChave) } : remover ? { evolutionApiKey: null } : {}),
    },
  });
  revalidatePath(CAMINHO);
  revalidatePath("/mensagens");
  return { ok: "Configuração do WhatsApp guardada." };
}

export async function testarLigacao(_prev: EstadoForm, _fd: FormData): Promise<EstadoForm> {
  void _fd;
  const { user, cfg } = await configuracao();
  const ev = configEvolution(cfg, user.tenant.slug);
  if (!ev) {
    return {
      aviso: "O serviço de envio WhatsApp ainda não está configurado neste centro. Enquanto não estiver ativo, pode utilizar o Modo de Teste.",
    };
  }
  try {
    const estado = await estadoConexao(ev);
    if (estado === "open") {
      return { ok: "Telemóvel associado e ativo — o WhatsApp do centro está pronto a enviar mensagens." };
    }
    if (estado === "connecting") {
      return {
        aviso: "Telemóvel a aguardar leitura do código QR. Clique em «Ligar WhatsApp (Gerar QR Code)» acima e aponte a câmara do telemóvel para concluir a associação.",
      };
    }
    return {
      aviso: "Nenhum telemóvel associado neste momento. Clique em «Ligar WhatsApp (Gerar QR Code)» acima para associar o número do centro.",
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

export type EstadoQrWhatsapp = {
  ok?: string;
  aviso?: string;
  erro?: string;
  qrCodeBase64?: string | null;
  pairingCode?: string | null;
  instancia?: string;
  ligado?: boolean;
};

export async function gerarQrCodeWhatsapp(): Promise<EstadoQrWhatsapp> {
  const { user, db, cfg } = await configuracao();
  const instancia = cfg.evolutionInstancia?.trim() || nomeInstanciaPadrao(user.tenant.slug);
  if (!cfg.evolutionInstancia) {
    await db.configuracaoCentro.update({
      where: { tenantId: user.tenantId },
      data: { evolutionInstancia: instancia },
    });
  }
  const ev = configEvolution({ ...cfg, evolutionInstancia: instancia }, user.tenant.slug);
  if (!ev) {
    return {
      aviso: "O serviço de envio WhatsApp ainda não está configurado na plataforma. Enquanto não estiver ativo, utilize o Modo de Teste.",
    };
  }
  const h = await headers();
  const base = urlBase(process.env.APP_URL, h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
  const urlWebhook = base ? `${base}/api/webhooks/evolution/${cfg.webhookToken}` : undefined;

  try {
    const res = await obterQrOuCriarInstancia(ev, urlWebhook);
    if (res.estado === "open") {
      return {
        ok: "O WhatsApp deste centro já se encontra associado e pronto a enviar mensagens.",
        instancia: ev.instancia,
        ligado: true,
      };
    }
    if (res.qrCodeBase64) {
      return {
        ok: "Código QR gerado. Aponte a câmara do WhatsApp do telemóvel do centro para a imagem abaixo.",
        qrCodeBase64: res.qrCodeBase64,
        pairingCode: res.pairingCode,
        instancia: ev.instancia,
        ligado: false,
      };
    }
    return {
      aviso: "O código QR está a ser preparado pelo serviço de WhatsApp. Aguarde alguns segundos e clique novamente no botão.",
      instancia: ev.instancia,
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e), instancia: ev.instancia };
  }
}

export async function desligarWhatsapp(_prev: EstadoForm, _fd: FormData): Promise<EstadoForm> {
  void _fd;
  const { user, cfg } = await configuracao();
  const ev = configEvolution(cfg, user.tenant.slug);
  if (!ev) return { aviso: "Nenhum serviço de WhatsApp configurado neste momento." };
  try {
    await desligarInstancia(ev);
    revalidatePath(CAMINHO);
    return { ok: "Telemóvel desassociado com sucesso. Pode agora gerar um novo código QR para associar outro número." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function enviarMensagemTeste(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db, cfg } = await configuracao();

  const numeroTxt = campo(fd, "numero");
  const destino = numeroTxt ? normalizarWhatsapp(numeroTxt) : null;
  if (!destino) return { erros: { numero: "Número de WhatsApp inválido (ex.: 923 000 000 ou +244923000000)." } };
  if (cfg.whatsappModo === "DESATIVADO") {
    return { aviso: "O WhatsApp está desativado. Escolha o Modo de Teste ou WhatsApp Ativo e guarde antes de testar." };
  }
  const texto =
    campo(fd, "texto")?.slice(0, 1000) ??
    `✅ Mensagem de teste de *${user.tenant.nome}*.\nSe recebeu esta mensagem, o envio por WhatsApp está a funcionar.`;

  let idExterno: string | null = null;
  let erro: string | null = null;
  if (cfg.whatsappModo === "EVOLUTION") {
    const ev = configEvolution(cfg, user.tenant.slug);
    if (!ev) erro = "Serviço de envio WhatsApp ainda não configurado.";
    else {
      try {
        idExterno = await enviarTexto(ev, destino, texto);
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
    }
  }

  const agora = new Date();
  await db.mensagem.create({
    data: {
      tenantId: user.tenantId,
      tipo: "TESTE",
      destino,
      texto,
      estado: erro ? "FALHADA" : "ENVIADA",
      tentativas: 1,
      erro,
      idExterno,
      enviadaEm: erro ? null : agora,
      criadaPorId: user.id,
    },
  });
  revalidatePath("/mensagens");

  if (erro) return { erro: `Falhou o envio: ${erro}` };
  if (cfg.whatsappModo === "SIMULACAO") {
    return { ok: `Simulação: a mensagem para ${destino} foi registada como enviada (nada foi enviado).` };
  }
  return { ok: `Mensagem de teste enviada para ${destino}.` };
}

export async function regenerarToken(_prev: EstadoForm, _fd: FormData): Promise<EstadoForm> {
  void _fd;
  const { user, db } = await configuracao();
  await db.configuracaoCentro.update({ where: { tenantId: user.tenantId }, data: { webhookToken: randomUUID() } });
  revalidatePath(CAMINHO);
  return { ok: "Novo URL de webhook gerado." };
}

// ── Automações ────────────────────────────────────────────────────────────────

const esquemaAutomacoes = z.object({
  diasAntesVencimento: z
    .number({ required_error: "Indique o número de dias.", invalid_type_error: "Indique um número inteiro." })
    .int()
    .min(0, "Mínimo 0 (no próprio dia).")
    .max(30, "Máximo de 30 dias."),
  horaEnvio: z
    .number({ required_error: "Indique a hora.", invalid_type_error: "Indique uma hora de 0 a 23." })
    .int()
    .min(0, "Indique uma hora de 0 a 23.")
    .max(23, "Indique uma hora de 0 a 23."),
  apresentacaoPublica: z.string().max(3000, "Máximo de 3000 caracteres.").nullable(),
});

export async function guardarAutomacoes(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await configuracao();

  const r = esquemaAutomacoes.safeParse({
    diasAntesVencimento: inteiro(fd, "diasAntesVencimento"),
    horaEnvio: inteiro(fd, "horaEnvio"),
    apresentacaoPublica: campo(fd, "apresentacaoPublica"),
  });
  const erros = r.success ? {} : errosZod(r.error);

  const dias = parseDiasAposAtraso(campo(fd, "diasAposAtraso"));
  if ("erro" in dias) erros.diasAposAtraso = dias.erro;

  const equipa = parseNumerosEquipa(campo(fd, "numerosEquipaComercial"));
  if (equipa.invalidos.length > 0) erros.numerosEquipaComercial = `Números inválidos: ${equipa.invalidos.join(", ")}`;
  else if (equipa.numeros.length > 20) erros.numerosEquipaComercial = "Indique no máximo 20 números.";

  if (!r.success || "erro" in dias || Object.keys(erros).length > 0) {
    return { erro: "Verifique os campos assinalados.", erros };
  }

  await db.configuracaoCentro.update({
    where: { tenantId: user.tenantId },
    data: {
      ...r.data,
      lembretesAtivos: fd.get("lembretesAtivos") === "on",
      confirmacoesAtivas: fd.get("confirmacoesAtivas") === "on",
      aniversariosAtivos: fd.get("aniversariosAtivos") === "on",
      diasAposAtraso: dias.dias,
      numerosEquipaComercial: equipa.numeros,
    },
  });
  revalidatePath(CAMINHO);
  return { ok: "Automações guardadas." };
}

// ── Fidelização e Programa de Indicação ───────────────────────────────────────

const esquemaFidelizacao = z.object({
  descontoFidelizacaoPct: z
    .number({ required_error: "Indique a percentagem.", invalid_type_error: "Indique um número inteiro." })
    .int("Indique um número inteiro.")
    .min(0, "Mínimo de 0%.")
    .max(50, "Máximo de 50%."),
  pontosPorIndicacao: z
    .number({ required_error: "Indique os pontos por indicação.", invalid_type_error: "Indique um número inteiro." })
    .int("Indique um número inteiro.")
    .min(1, "Mínimo de 1 ponto.")
    .max(100, "Máximo de 100 pontos."),
  percentagemPorPonto: z
    .number({ required_error: "Indique a percentagem por ponto.", invalid_type_error: "Indique um número inteiro." })
    .int("Indique um número inteiro.")
    .min(1, "Mínimo de 1%.")
    .max(20, "Máximo de 20%."),
  limiteDescontoIndicacaoPct: z
    .number({ required_error: "Indique o limite de desconto.", invalid_type_error: "Indique um número inteiro." })
    .int("Indique um número inteiro.")
    .min(1, "Mínimo de 1%.")
    .max(50, "Máximo de 50%."),
  validadePontosMeses: z
    .number({ required_error: "Indique a validade em meses.", invalid_type_error: "Indique um número inteiro." })
    .int("Indique um número inteiro.")
    .min(1, "Mínimo de 1 mês.")
    .max(60, "Máximo de 60 meses."),
});

export async function guardarFidelizacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await configuracao();

  const r = esquemaFidelizacao.safeParse({
    descontoFidelizacaoPct: inteiro(fd, "descontoFidelizacaoPct"),
    pontosPorIndicacao: inteiro(fd, "pontosPorIndicacao"),
    percentagemPorPonto: inteiro(fd, "percentagemPorPonto"),
    limiteDescontoIndicacaoPct: inteiro(fd, "limiteDescontoIndicacaoPct"),
    validadePontosMeses: inteiro(fd, "validadePontosMeses"),
  });

  if (!r.success) {
    return { erro: "Verifique os campos assinalados.", erros: errosZod(r.error) };
  }

  await db.configuracaoCentro.update({
    where: { tenantId: user.tenantId },
    data: r.data,
  });

  revalidatePath(CAMINHO);
  revalidatePath("/formandos");
  revalidatePath("/matriculas/nova");
  return { ok: "Regras de fidelização e indicação guardadas." };
}

// ── Modelos de mensagem ───────────────────────────────────────────────────────

function tipoValido(tipo: string): tipo is TipoModelo {
  return (TIPOS_MODELO as string[]).includes(tipo);
}

export async function guardarModelo(tipo: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("configuracoes:editar");
  if (!tipoValido(tipo)) return { erro: "Tipo de mensagem inválido." };

  const texto = (typeof fd.get("texto") === "string" ? (fd.get("texto") as string) : "").replace(/\r\n?/g, "\n").trim();
  if (!texto) return { erros: { texto: "Escreva o texto da mensagem." } };
  if (texto.length > 4000) return { erros: { texto: "Máximo de 4000 caracteres." } };

  const permitidas = new Set(MODELOS_PADRAO[tipo].variaveis);
  const desconhecidas = [...new Set([...texto.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))].filter(
    (v) => !permitidas.has(v),
  );
  if (desconhecidas.length > 0) {
    return { erros: { texto: `Variáveis desconhecidas: ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}.` } };
  }

  const ativo = fd.get("ativo") === "on";
  await db.modeloMensagem.upsert({
    where: { tenantId_tipo: { tenantId: user.tenantId, tipo } },
    create: { tenantId: user.tenantId, tipo, texto, ativo },
    update: { texto, ativo },
  });
  revalidatePath(CAMINHO);
  return { ok: "Modelo guardado." };
}

export async function reporModelo(tipo: string, _prev: EstadoForm, _fd: FormData): Promise<EstadoForm> {
  void _fd;
  const { db } = await exigir("configuracoes:editar");
  if (!tipoValido(tipo)) return { erro: "Tipo de mensagem inválido." };
  await db.modeloMensagem.deleteMany({ where: { tipo } });
  revalidatePath(CAMINHO);
  return { ok: "Texto padrão reposto." };
}

// ── Utilizadores ──────────────────────────────────────────────────────────────

const PERFIS = ["ADMIN", "COMERCIAL", "PEDAGOGICO", "FINANCEIRO"] as const;
const perfil = z.enum(PERFIS, { errorMap: () => ({ message: "Escolha o perfil." }) });
const password = z
  .string({ required_error: "Indique a palavra-passe." })
  .min(8, "A palavra-passe tem de ter pelo menos 8 caracteres.")
  .max(200, "Palavra-passe demasiado longa.");

const esquemaUtilizador = z.object({
  nome: z.string({ required_error: "Indique o nome." }).min(2, "Indique o nome.").max(150),
  email: z.string({ required_error: "Indique o email." }).email("Email inválido.").max(150),
  perfil,
  password,
});

function revalidarUtilizadores() {
  revalidatePath(CAMINHO);
  revalidatePath("/utilizadores");
}

export async function criarUtilizador(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("utilizadores:gerir");
  const r = esquemaUtilizador.safeParse({
    nome: campo(fd, "nome") ?? undefined,
    email: campo(fd, "email")?.toLowerCase() ?? undefined,
    perfil: campo(fd, "perfil") ?? undefined,
    password: (fd.get("password") as string | null) || undefined,
  });
  if (!r.success) return { erro: "Verifique os campos assinalados.", erros: errosZod(r.error) };

  try {
    await db.user.create({
      data: {
        tenantId: user.tenantId,
        nome: r.data.nome,
        email: r.data.email,
        perfil: r.data.perfil,
        passwordHash: await hashPassword(r.data.password),
      },
      select: { id: true },
    });
  } catch (e) {
    if (eUnicidade(e)) return { erros: { email: "Já existe um utilizador com este email." } };
    throw e;
  }
  revalidarUtilizadores();
  return { ok: `Utilizador ${r.data.nome} criado. Comunique-lhe a palavra-passe inicial.` };
}

/** Há outro administrador ativo além do indicado? */
async function haOutroAdmin(db: Awaited<ReturnType<typeof exigir>>["db"], excetoId: string) {
  const n = await db.user.count({ where: { perfil: "ADMIN", ativo: true, id: { not: excetoId } } });
  return n > 0;
}

export async function alterarPerfil(userId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("utilizadores:gerir");
  const r = perfil.safeParse(campo(fd, "perfil") ?? undefined);
  if (!r.success) return { erro: "Escolha o perfil." };
  if (userId === user.id) return { erro: "Não pode alterar o seu próprio perfil." };

  const alvo = await db.user.findFirst({ where: { id: userId }, select: { id: true, perfil: true, ativo: true } });
  if (!alvo) return { erro: "Utilizador não encontrado." };
  if (alvo.perfil === r.data) return { ok: "Sem alterações." };
  if (alvo.perfil === "ADMIN" && alvo.ativo && !(await haOutroAdmin(db, alvo.id))) {
    return { erro: "Tem de existir pelo menos um administrador ativo." };
  }
  await db.user.update({ where: { id: alvo.id }, data: { perfil: r.data as Perfil } });
  revalidarUtilizadores();
  return { ok: "Perfil alterado." };
}

export async function alterarAtivo(userId: string, ativo: boolean, _prev: EstadoForm, _fd: FormData): Promise<EstadoForm> {
  void _fd;
  const { user, db } = await exigir("utilizadores:gerir");
  if (userId === user.id) return { erro: "Não pode desativar a sua própria conta." };

  const alvo = await db.user.findFirst({ where: { id: userId }, select: { id: true, perfil: true, ativo: true } });
  if (!alvo) return { erro: "Utilizador não encontrado." };
  if (!ativo && alvo.perfil === "ADMIN" && alvo.ativo && !(await haOutroAdmin(db, alvo.id))) {
    return { erro: "Tem de existir pelo menos um administrador ativo." };
  }

  await db.user.update({ where: { id: alvo.id }, data: { ativo } });
  // Termina as sessões abertas do utilizador desativado.
  if (!ativo) await db.userSession.deleteMany({ where: { userId: alvo.id, user: { tenantId: user.tenantId } } });
  revalidarUtilizadores();
  return { ok: ativo ? "Utilizador reativado." : "Utilizador desativado e sessões terminadas." };
}

export async function redefinirPassword(userId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("utilizadores:gerir");
  const r = password.safeParse((fd.get("password") as string | null) || undefined);
  if (!r.success) return { erros: { password: r.error.issues[0]?.message ?? "Palavra-passe inválida." } };

  const alvo = await db.user.findFirst({ where: { id: userId }, select: { id: true, nome: true } });
  if (!alvo) return { erro: "Utilizador não encontrado." };

  await db.user.update({ where: { id: alvo.id }, data: { passwordHash: await hashPassword(r.data) } });
  // As outras sessões do utilizador deixam de ser válidas (a do próprio administrador mantém-se).
  if (alvo.id !== user.id) {
    await db.userSession.deleteMany({ where: { userId: alvo.id, user: { tenantId: user.tenantId } } });
  }
  revalidarUtilizadores();
  return { ok: `Palavra-passe de ${alvo.nome} redefinida.` };
}

// ── Dados Bancários (IBAN / Express) e Certificados ──────────────────────────

const esquemaBancariosCertificados = z.object({
  bancoNome: z.string().max(100, "Máximo de 100 caracteres.").nullable(),
  iban: z.string().max(60, "Máximo de 60 caracteres.").nullable(),
  titularConta: z.string().max(140, "Máximo de 140 caracteres.").nullable(),
  multicaixaExpress: z.string().max(40, "Máximo de 40 caracteres.").nullable(),
  minAssiduidadeCertificadoPct: z
    .number({ invalid_type_error: "Indique uma percentagem inteira." })
    .int()
    .min(0, "Mínimo de 0%.")
    .max(100, "Máximo de 100%."),
});

export async function guardarBancariosCertificadosAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await configuracao();

  const r = esquemaBancariosCertificados.safeParse({
    bancoNome: campo(fd, "bancoNome"),
    iban: campo(fd, "iban"),
    titularConta: campo(fd, "titularConta"),
    multicaixaExpress: campo(fd, "multicaixaExpress"),
    minAssiduidadeCertificadoPct: inteiro(fd, "minAssiduidadeCertificadoPct"),
  });

  if (!r.success) {
    return { erro: "Verifique os campos assinalados.", erros: errosZod(r.error) };
  }

  await db.configuracaoCentro.update({
    where: { tenantId: user.tenantId },
    data: r.data,
  });

  revalidatePath(CAMINHO);
  revalidatePath("/turmas");
  revalidatePath("/financeiro");
  return { ok: "Dados bancários e regra de emissão de certificados guardados." };
}

// ── Relatórios Automáticos IA (Claude) e Alertas ─────────────────────────────

function parseEmailsLista(texto: string | null | undefined): { emails: string[]; invalidos: string[] } {
  const linhas = (texto ?? "")
    .split(/[\n,;]+/)
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  const emails: string[] = [];
  const invalidos: string[] = [];
  const validador = z.string().email();
  for (const l of linhas) {
    if (validador.safeParse(l).success) {
      if (!emails.includes(l)) emails.push(l);
    } else {
      invalidos.push(l);
    }
  }
  return { emails, invalidos };
}

const esquemaRelatoriosIa = z.object({
  iaAtiva: z.boolean(),
  modeloClaude: z.string().min(3, "Indique o modelo.").max(100),
  relatorioSemanalAtivo: z.boolean(),
  diaSemanaRelatorio: z.number().int().min(0).max(6),
  relatorioMensalAtivo: z.boolean(),
  diaMesRelatorio: z.number().int().min(1).max(28),
  horaRelatorio: z.number().int().min(0).max(23),
  alertasImediatosAtivos: z.boolean(),
  limiarInadimplenciaPct: z.number().int().min(1).max(100),
  canalRelatorio: z.enum(["APENAS_SISTEMA", "WHATSAPP", "EMAIL", "AMBOS"]),
  emailRemetente: z.string().max(150).nullable(),
});

export async function guardarRelatoriosIaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await configuracao();

  const r = esquemaRelatoriosIa.safeParse({
    iaAtiva: fd.get("iaAtiva") === "on",
    modeloClaude: campo(fd, "modeloClaude") ?? "claude-sonnet-4-20250514",
    relatorioSemanalAtivo: fd.get("relatorioSemanalAtivo") === "on",
    diaSemanaRelatorio: inteiro(fd, "diaSemanaRelatorio") ?? 1,
    relatorioMensalAtivo: fd.get("relatorioMensalAtivo") === "on",
    diaMesRelatorio: inteiro(fd, "diaMesRelatorio") ?? 1,
    horaRelatorio: inteiro(fd, "horaRelatorio") ?? 8,
    alertasImediatosAtivos: fd.get("alertasImediatosAtivos") === "on",
    limiarInadimplenciaPct: inteiro(fd, "limiarInadimplenciaPct") ?? 20,
    canalRelatorio: campo(fd, "canalRelatorio") ?? "WHATSAPP",
    emailRemetente: campo(fd, "emailRemetente"),
  });

  const erros: Record<string, string> = r.success ? {} : errosZod(r.error);

  const numParsed = parseNumerosEquipa(campo(fd, "destinatariosWhatsappRelatorio"));
  if (numParsed.invalidos.length > 0) {
    erros.destinatariosWhatsappRelatorio = `Números inválidos: ${numParsed.invalidos.join(", ")}`;
  }

  const emailParsed = parseEmailsLista(campo(fd, "destinatariosEmailRelatorio"));
  if (emailParsed.invalidos.length > 0) {
    erros.destinatariosEmailRelatorio = `E-mails inválidos: ${emailParsed.invalidos.join(", ")}`;
  }

  const novaAnthropicKey = campo(fd, "anthropicApiKey");
  const removerAnthropicKey = fd.get("removerAnthropicApiKey") === "on";
  if (novaAnthropicKey && novaAnthropicKey.length > 300) {
    erros.anthropicApiKey = "Chave API demasiado longa.";
  }

  const novaResendKey = campo(fd, "resendApiKey");
  const removerResendKey = fd.get("removerResendApiKey") === "on";
  if (novaResendKey && novaResendKey.length > 300) {
    erros.resendApiKey = "Chave de e-mail demasiado longa.";
  }

  if (!r.success || Object.keys(erros).length > 0) {
    return { erro: "Verifique os campos assinalados.", erros };
  }

  await db.configuracaoCentro.update({
    where: { tenantId: user.tenantId },
    data: {
      ...r.data,
      destinatariosWhatsappRelatorio: numParsed.numeros,
      destinatariosEmailRelatorio: emailParsed.emails,
      ...(novaAnthropicKey
        ? { anthropicApiKey: cifrar(novaAnthropicKey) }
        : removerAnthropicKey
          ? { anthropicApiKey: null }
          : {}),
      ...(novaResendKey
        ? { resendApiKey: cifrar(novaResendKey) }
        : removerResendKey
          ? { resendApiKey: null }
          : {}),
    },
  });

  revalidatePath(CAMINHO);
  revalidatePath("/inteligencia");
  return { ok: "Agendamento, destinatários e credenciais de Relatórios IA guardados." };
}
