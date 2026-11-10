"use server";

import { Prisma, type MetodoPagamento } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { CRITERIOS, type CampoCriterio } from "@/lib/avaliacoes";
import {
  chaveAvaliacaoAnonima,
  gerarCodigoCertificado,
  verificarElegibilidadeCertificado,
} from "@/lib/certificados";
import { dataSimples, hojeLocal } from "@/lib/datas";
import { dbTenant, prisma } from "@/lib/db";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { formatKz, parseKz } from "@/lib/money";
import { comPago, resumirParcelas } from "@/lib/parcelas";
import { calcularAssiduidade } from "@/lib/presencas";
import { campo } from "@/lib/utils";

const METODOS_VALIDOS = new Set<MetodoPagamento>([
  "MULTICAIXA",
  "REFERENCIA",
  "TRANSFERENCIA",
  "NUMERARIO",
  "TPA",
  "OUTRO",
]);

export async function comunicarPagamentoPortalAction(
  portalToken: string,
  matriculaId: string,
  fd: FormData,
): Promise<{ ok?: string; erro?: string }> {
  if (!portalToken || !matriculaId) {
    return { erro: "Dados de comunicação inválidos." };
  }

  const formando = await prisma.formando.findUnique({
    where: { portalToken },
    select: { id: true, tenantId: true },
  });
  if (!formando) {
    return { erro: "Link de portal inválido." };
  }

  const db = dbTenant({ tenantId: formando.tenantId });
  const matricula = await db.matricula.findFirst({
    where: {
      id: matriculaId,
      formandoId: formando.id,
      estado: { not: "CANCELADA" },
    },
    include: {
      parcelas: {
        orderBy: { numero: "asc" },
        include: { alocacoes: { select: { valor: true } } },
      },
    },
  });

  if (!matricula) {
    return { erro: "Matrícula não encontrada." };
  }

  const hoje = dataSimples(hojeLocal());
  const resumo = resumirParcelas(matricula.parcelas.map(comPago), hoje);
  if (resumo.divida <= 0n) {
    return { erro: "Esta matrícula já se encontra totalmente liquidada." };
  }

  const valor = parseKz(campo(fd, "valor"));
  if (valor === null || valor <= 0n) {
    return { erro: "Indique um valor válido em Kwanzas (ex.: 25 000,00)." };
  }
  if (valor > resumo.divida) {
    return {
      erro: `O valor comunicado (${formatKz(valor)}) excede o saldo em aberto desta matrícula (${formatKz(resumo.divida)}).`,
    };
  }

  const metodoBruto = (campo(fd, "metodo") ?? "TRANSFERENCIA") as MetodoPagamento;
  if (!METODOS_VALIDOS.has(metodoBruto)) {
    return { erro: "Selecione um método de pagamento válido." };
  }

  const referencia = campo(fd, "referencia");
  if (!referencia) {
    return { erro: "Indique a referência, n.º de transação ou comprovativo bancário." };
  }
  if (referencia.length > 150) {
    return { erro: "A referência não pode exceder 150 caracteres." };
  }

  const dataTxt = campo(fd, "dataTransferencia") ?? hojeLocal();
  let dataTransferencia: Date;
  try {
    dataTransferencia = dataSimples(dataTxt);
  } catch {
    return { erro: "Indique uma data de pagamento/transferência válida." };
  }

  const parcelaId = campo(fd, "parcelaId");
  if (parcelaId && !matricula.parcelas.some((p) => p.id === parcelaId)) {
    return { erro: "A parcela selecionada não pertence a esta matrícula." };
  }

  const notas = campo(fd, "notas");
  if (notas && notas.length > 1000) {
    return { erro: "As observações não podem exceder 1000 caracteres." };
  }

  await db.avisoPagamento.create({
    data: {
      tenantId: formando.tenantId,
      formandoId: formando.id,
      matriculaId: matricula.id,
      parcelaId: parcelaId ?? null,
      valor,
      metodo: metodoBruto,
      referencia,
      dataTransferencia,
      notas: notas ?? null,
      estado: "PENDENTE",
    },
  });

  revalidatePath(`/portal/formando/${portalToken}`);
  revalidatePath("/financeiro");
  revalidatePath(`/formandos/${formando.id}`);
  revalidatePath("/painel");

  return {
    ok: "Comunicação de pagamento registada! A equipa financeira irá validar o seu comprovativo.",
  };
}

export async function submeterAvaliacaoAnonimaPortalAction(
  portalToken: string,
  matriculaId: string,
  formadorId: string,
  fd: FormData,
): Promise<{ ok?: string; erro?: string }> {
  if (!portalToken || !matriculaId || !formadorId) {
    return { erro: "Dados de avaliação inválidos." };
  }

  const formando = await prisma.formando.findUnique({
    where: { portalToken },
    select: { id: true, tenantId: true },
  });
  if (!formando) {
    return { erro: "Link de portal inválido." };
  }

  const db = dbTenant({ tenantId: formando.tenantId });
  const matricula = await db.matricula.findFirst({
    where: {
      id: matriculaId,
      formandoId: formando.id,
      estado: { in: ["ATIVA", "CONCLUIDA"] },
    },
    select: {
      id: true,
      turma: {
        select: {
          id: true,
          sessoes: {
            where: {
              estado: { not: "CANCELADA" },
              formadorId,
            },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!matricula) {
    return { erro: "Matrícula não encontrada ou não elegível para avaliação." };
  }
  if (matricula.turma.sessoes.length === 0) {
    return { erro: "Este formador não leciona nesta turma." };
  }

  const notas = {} as Record<CampoCriterio, number>;
  for (const c of CRITERIOS) {
    const valTxt = campo(fd, c.campo);
    const n = valTxt ? Number(valTxt) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { erro: `Selecione uma classificação de 1 a 5 em "${c.nome}".` };
    }
    notas[c.campo] = n;
  }

  const comentario = campo(fd, "comentario");
  if (comentario && comentario.length > 2000) {
    return { erro: "O comentário não pode exceder 2000 caracteres." };
  }

  const chaveAnonima = chaveAvaliacaoAnonima(matricula.id, formadorId);

  const existente = await db.avaliacaoFormador.findFirst({
    where: { chaveAnonima },
    select: { id: true },
  });
  if (existente) {
    return { ok: "A sua avaliação anónima para este formador já se encontra registada." };
  }

  try {
    await db.avaliacaoFormador.create({
      data: {
        tenantId: formando.tenantId,
        formadorId,
        turmaId: matricula.turma.id,
        dominioConteudo: notas.dominioConteudo,
        eticaProfissional: notas.eticaProfissional,
        cumprimentoHorarios: notas.cumprimentoHorarios,
        enquadramentoExercicios: notas.enquadramentoExercicios,
        capacidadeMotivar: notas.capacidadeMotivar,
        comentario: comentario ?? null,
        avaliadoPor: "Formando (Anónimo)",
        chaveAnonima,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: "A sua avaliação anónima para este formador já foi submetida." };
    }
    throw e;
  }

  revalidatePath(`/portal/formando/${portalToken}`);
  revalidatePath("/formadores");
  revalidatePath(`/formadores/${formadorId}`);
  revalidatePath(`/turmas/${matricula.turma.id}`);
  revalidatePath("/inteligencia");

  return { ok: "Obrigado! A sua avaliação anónima foi registada com sucesso." };
}

export async function emitirCertificadoPortalAction(
  portalToken: string,
  matriculaId: string,
): Promise<{ ok?: string; erro?: string; url?: string }> {
  if (!portalToken || !matriculaId) {
    return { erro: "Dados de certificado inválidos." };
  }

  const formando = await prisma.formando.findUnique({
    where: { portalToken },
    select: { id: true, tenantId: true },
  });
  if (!formando) {
    return { erro: "Link de portal inválido." };
  }

  const db = dbTenant({ tenantId: formando.tenantId });
  const [matricula, cfg] = await Promise.all([
    db.matricula.findFirst({
      where: {
        id: matriculaId,
        formandoId: formando.id,
      },
      include: {
        certificado: true,
        turma: {
          include: {
            formacao: { select: { cargaHoraria: true } },
            sessoes: {
              where: { estado: { not: "CANCELADA" } },
              include: {
                presencas: { select: { matriculaId: true, estado: true } },
              },
            },
          },
        },
        parcelas: {
          include: { alocacoes: { select: { valor: true } } },
        },
      },
    }),
    obterConfiguracao(comoCliente(db), formando.tenantId),
  ]);

  if (!matricula) {
    return { erro: "Matrícula não encontrada." };
  }

  const hoje = dataSimples(hojeLocal());
  const resumo = resumirParcelas(matricula.parcelas.map(comPago), hoje);
  const assid = calcularAssiduidade(
    matricula.turma.sessoes.map((s) => ({
      id: s.id,
      inicio: s.inicio,
      estado: s.estado,
      temChamadaLancada: s.presencas.length > 0,
      estadoAluno: s.presencas.find((p) => p.matriculaId === matricula.id)?.estado ?? null,
    })),
  );

  const elegibilidade = verificarElegibilidadeCertificado({
    estadoMatricula: matricula.estado,
    dividaCentimos: resumo.divida,
    assiduidadePct: assid.assiduidadePct,
    minAssiduidadePct: cfg.minAssiduidadeCertificadoPct,
    revogado: Boolean(matricula.certificado?.revogadoEm),
  });

  if (!elegibilidade.elegivel) {
    return { erro: elegibilidade.motivosBloqueio.join(" ") };
  }

  let certificado = matricula.certificado;
  if (!certificado) {
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = gerarCodigoCertificado();
      try {
        certificado = await db.certificado.create({
          data: {
            tenantId: formando.tenantId,
            matriculaId: matricula.id,
            codigo,
            cargaHoraria: matricula.turma.formacao.cargaHoraria,
            assiduidadePct: assid.assiduidadePct,
          },
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const existente = await db.certificado.findUnique({
            where: { matriculaId: matricula.id },
          });
          if (existente) {
            certificado = existente;
            break;
          }
          continue;
        }
        throw e;
      }
    }
  }

  if (!certificado) {
    return { erro: "Não foi possível gerar o código único do certificado. Tente novamente." };
  }

  const url = `/portal/formando/${portalToken}/certificado/${matricula.id}`;
  revalidatePath(`/portal/formando/${portalToken}`);
  revalidatePath(url);
  revalidatePath(`/turmas/${matricula.turmaId}`);
  revalidatePath(`/formandos/${formando.id}`);

  return {
    ok: "Certificado digital emitido com sucesso!",
    url,
  };
}
