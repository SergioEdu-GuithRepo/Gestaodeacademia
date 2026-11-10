"use server";

import type { CategoriaDespesa, MetodoPagamento } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { dataSimples } from "@/lib/datas";
import { CATEGORIAS_DESPESA } from "@/lib/financeiro";
import { comoCliente } from "@/lib/mensagens/config";
import { aoRegistarPagamento } from "@/lib/mensagens/eventos";
import { formatKz, parseKz } from "@/lib/money";
import { alocarPagamento, comPago } from "@/lib/parcelas";
import { campo, type EstadoForm } from "@/lib/utils";

class ErroNegocio extends Error {}

const METODOS_VALIDOS: readonly MetodoPagamento[] = [
  "MULTICAIXA",
  "REFERENCIA",
  "TRANSFERENCIA",
  "NUMERARIO",
  "TPA",
  "OUTRO",
] as const;

const esquemaDespesa = z.object({
  categoria: z.enum(CATEGORIAS_DESPESA as [CategoriaDespesa, ...CategoriaDespesa[]], {
    message: "Selecione uma categoria válida.",
  }),
  descricao: z.string().min(2, "Indique uma descrição (mínimo 2 caracteres).").max(200),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indique uma data válida."),
  fornecedor: z.string().max(120).optional().nullable(),
  metodo: z.enum(METODOS_VALIDOS as [MetodoPagamento, ...MetodoPagamento[]]),
  referencia: z.string().max(100).optional().nullable(),
  formacaoId: z.string().optional().nullable(),
  turmaId: z.string().optional().nullable(),
  formadorId: z.string().optional().nullable(),
  horasPagas: z.number().nonnegative().max(1000).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
});

export async function registarDespesaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("financeiro:editar");

  const valorCentimos = parseKz(campo(fd, "valor") ?? "");
  if (valorCentimos === null || valorCentimos <= 0n) {
    return { erros: { valor: "Indique um valor superior a 0 Kz." } };
  }

  const horasTexto = (campo(fd, "horasPagas") ?? "").replace(",", ".");
  const horasNum = horasTexto ? Number(horasTexto) : null;
  if (horasTexto && (!Number.isFinite(horasNum) || (horasNum ?? 0) < 0)) {
    return { erros: { horasPagas: "Indique um número de horas válido." } };
  }

  const validacao = esquemaDespesa.safeParse({
    categoria: campo(fd, "categoria") ?? "",
    descricao: campo(fd, "descricao") ?? "",
    data: campo(fd, "data") ?? "",
    fornecedor: campo(fd, "fornecedor"),
    metodo: campo(fd, "metodo") ?? "TRANSFERENCIA",
    referencia: campo(fd, "referencia"),
    formacaoId: campo(fd, "formacaoId"),
    turmaId: campo(fd, "turmaId"),
    formadorId: campo(fd, "formadorId"),
    horasPagas: horasNum,
    notas: campo(fd, "notas"),
  });

  if (!validacao.success) {
    const erros: Record<string, string> = {};
    for (const issue of validacao.error.issues) {
      const k = String(issue.path[0] ?? "geral");
      if (!erros[k]) erros[k] = issue.message;
    }
    return { erros };
  }

  const d = validacao.data;

  await db.despesa.create({
    data: {
      tenantId: user.tenantId,
      categoria: d.categoria,
      descricao: d.descricao,
      valor: valorCentimos,
      data: dataSimples(d.data),
      fornecedor: d.fornecedor,
      metodo: d.metodo,
      referencia: d.referencia,
      formacaoId: d.formacaoId || null,
      turmaId: d.turmaId || null,
      formadorId: d.formadorId || null,
      horasPagas: d.horasPagas ?? null,
      notas: d.notas,
      registadoPorId: user.id,
    },
  });

  revalidatePath("/financeiro");
  revalidatePath("/painel");
  revalidatePath("/campanhas");
  return { ok: "Despesa operacional registada com sucesso." };
}

export async function liquidarFormadorAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("financeiro:editar");

  const formadorId = campo(fd, "formadorId");
  if (!formadorId) return { erro: "Formador em falta." };

  const formador = await db.formador.findFirst({ where: { id: formadorId } });
  if (!formador) return { erro: "Formador não encontrado." };

  const valorCentimos = parseKz(campo(fd, "valor") ?? "");
  if (valorCentimos === null || valorCentimos <= 0n) {
    return { erro: "Indique um valor a pagar superior a 0 Kz." };
  }

  const horasTexto = (campo(fd, "horasPagas") ?? "").replace(",", ".");
  const horasPagas = horasTexto && Number.isFinite(Number(horasTexto)) ? Number(horasTexto) : null;
  const dataStr = campo(fd, "data") || new Date().toISOString().slice(0, 10);
  const metodo = (campo(fd, "metodo") || "TRANSFERENCIA") as MetodoPagamento;
  const referencia = campo(fd, "referencia");
  const descricao =
    campo(fd, "descricao") ||
    `Honorários de formação — ${formador.nome}${horasPagas ? ` (${horasPagas} h)` : ""}`;

  await db.despesa.create({
    data: {
      tenantId: user.tenantId,
      categoria: "FORMADOR",
      descricao,
      valor: valorCentimos,
      data: dataSimples(dataStr),
      fornecedor: formador.nome,
      metodo: METODOS_VALIDOS.includes(metodo) ? metodo : "TRANSFERENCIA",
      referencia,
      formadorId: formador.id,
      horasPagas,
      registadoPorId: user.id,
    },
  });

  revalidatePath("/financeiro");
  revalidatePath("/painel");
  return { ok: `Pagamento a ${formador.nome} registado com sucesso.` };
}

export async function apagarDespesaAction(despesaId: string): Promise<void> {
  const { db } = await exigir("financeiro:editar");
  if (!despesaId) return;
  await db.despesa.deleteMany({ where: { id: despesaId } });
  revalidatePath("/financeiro");
  revalidatePath("/painel");
  revalidatePath("/campanhas");
}

// ─────────────── Comunicações de Pagamento do Portal (AvisoPagamento) ─────────

export async function confirmarAvisoPagamentoAction(
  avisoId: string,
  referenciaRecibo?: string | null,
): Promise<{ ok?: string; erro?: string }> {
  const { user, db } = await exigir("pagamentos:registar");
  if (!avisoId) return { erro: "Identificador da comunicação em falta." };

  const tenantId = user.tenantId;
  let formandoIdAfetado = "";
  let turmaIdAfetada = "";

  try {
    await db.$transaction(async (tx) => {
      const avisoInicial = await tx.avisoPagamento.findFirst({
        where: { id: avisoId, tenantId },
        include: {
          matricula: {
            select: {
              id: true,
              formandoId: true,
              turmaId: true,
              estado: true,
              turma: { select: { estado: true } },
            },
          },
        },
      });

      if (!avisoInicial) throw new ErroNegocio("Comunicação de pagamento não encontrada.");
      if (avisoInicial.estado !== "PENDENTE") {
        throw new ErroNegocio("Esta comunicação de pagamento já foi analisada.");
      }

      formandoIdAfetado = avisoInicial.formandoId;
      turmaIdAfetada = avisoInicial.matricula.turmaId;

      // Bloqueia a matrícula para serializar liquidações concorrentes
      await tx.$queryRaw`SELECT id FROM "Matricula" WHERE id = ${avisoInicial.matriculaId} AND "tenantId" = ${tenantId} FOR UPDATE`;

      const [aviso, matricula] = await Promise.all([
        tx.avisoPagamento.findFirst({ where: { id: avisoId, tenantId } }),
        tx.matricula.findFirst({
          where: { id: avisoInicial.matriculaId, tenantId },
          include: { parcelas: { include: { alocacoes: { select: { valor: true } } } } },
        }),
      ]);

      if (!aviso || aviso.estado !== "PENDENTE") {
        throw new ErroNegocio("Esta comunicação de pagamento já foi processada.");
      }
      if (!matricula) throw new ErroNegocio("Matrícula não encontrada.");
      if (matricula.estado === "CANCELADA") {
        throw new ErroNegocio("Não é possível liquidar pagamentos numa matrícula cancelada.");
      }

      const parcelas = matricula.parcelas.map(comPago);
      const divida = parcelas.reduce((s, p) => s + (p.valor > p.pago ? p.valor - p.pago : 0n), 0n);

      if (divida <= 0n) {
        throw new ErroNegocio("Esta matrícula já se encontra totalmente paga.");
      }
      if (aviso.valor <= 0n) {
        throw new ErroNegocio("O valor comunicado é inválido.");
      }
      if (aviso.valor > divida) {
        throw new ErroNegocio(
          `O valor comunicado (${formatKz(aviso.valor)}) excede a dívida restante desta matrícula (${formatKz(divida)}).`,
        );
      }

      const alocacoes = alocarPagamento(
        aviso.valor,
        parcelas.map((p) => ({ id: p.id, numero: p.numero, valor: p.valor, pago: p.pago })),
      );

      const pagamento = await tx.pagamento.create({
        data: {
          tenantId,
          formandoId: aviso.formandoId,
          matriculaId: matricula.id,
          valor: aviso.valor,
          metodo: aviso.metodo,
          dataPagamento: aviso.dataTransferencia,
          referencia: aviso.referencia,
          referenciaRecibo: referenciaRecibo?.trim() || null,
          notas: aviso.notas
            ? `Validado via Portal: ${aviso.notas}`
            : "Comunicação de pagamento submetida no Portal e validada pela tesouraria.",
          registadoPorId: user.id,
          alocacoes: { create: alocacoes },
        },
        select: { id: true },
      });

      if (divida - aviso.valor === 0n && avisoInicial.matricula.turma.estado === "CONCLUIDA" && matricula.estado === "ATIVA") {
        await tx.matricula.update({
          where: { id: matricula.id },
          data: { estado: "CONCLUIDA" },
        });
      }

      await tx.avisoPagamento.update({
        where: { id: aviso.id },
        data: {
          estado: "CONFIRMADO",
          pagamentoGeradoId: pagamento.id,
          analisadoPorId: user.id,
          analisadoEm: new Date(),
        },
      });

      // Enfileira confirmação automática por WhatsApp na mesma transação
      await aoRegistarPagamento(comoCliente(tx), {
        tenantId,
        pagamentoId: pagamento.id,
      });
    });
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    throw e;
  }

  revalidatePath("/financeiro");
  revalidatePath("/painel");
  revalidatePath("/formandos");
  if (formandoIdAfetado) revalidatePath(`/formandos/${formandoIdAfetado}`);
  if (turmaIdAfetada) revalidatePath(`/turmas/${turmaIdAfetada}`);
  revalidatePath("/mensagens");

  return { ok: "Pagamento confirmado, parcelas liquidadas e recibo WhatsApp enfileirado." };
}

export async function rejeitarAvisoPagamentoAction(
  avisoId: string,
): Promise<{ ok?: string; erro?: string }> {
  const { user, db } = await exigir("pagamentos:registar");
  if (!avisoId) return { erro: "Identificador da comunicação em falta." };

  const aviso = await db.avisoPagamento.findFirst({ where: { id: avisoId } });
  if (!aviso) return { erro: "Comunicação de pagamento não encontrada." };
  if (aviso.estado !== "PENDENTE") {
    return { erro: "Esta comunicação de pagamento já foi analisada." };
  }

  await db.avisoPagamento.update({
    where: { id: aviso.id },
    data: {
      estado: "REJEITADO",
      analisadoPorId: user.id,
      analisadoEm: new Date(),
    },
  });

  revalidatePath("/financeiro");
  revalidatePath("/painel");
  revalidatePath("/formandos");
  revalidatePath(`/formandos/${aviso.formandoId}`);

  return { ok: "Comunicação de pagamento rejeitada." };
}
