"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { dataSimples, hojeLocal } from "@/lib/datas";
import { comoCliente } from "@/lib/mensagens/config";
import { aoRegistarPagamento } from "@/lib/mensagens/eventos";
import { formatKz, parseKz } from "@/lib/money";
import { alocarPagamento, comPago } from "@/lib/parcelas";
import { campo, type EstadoForm } from "@/lib/utils";

class ErroNegocio extends Error {}

const esquema = z.object({
  matriculaId: z.string({ required_error: "Matrícula em falta." }).min(1),
  metodo: z.enum(["MULTICAIXA", "REFERENCIA", "TRANSFERENCIA", "NUMERARIO", "TPA", "OUTRO"], {
    errorMap: () => ({ message: "Escolha o método de pagamento." }),
  }),
  dataPagamento: z.string({ required_error: "Indique a data." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  referencia: z.string().max(120).nullable(),
  referenciaRecibo: z.string().max(120).nullable(),
  notas: z.string().max(1000).nullable(),
});

export async function registarPagamento(formandoId: string, _prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("pagamentos:registar");

  const r = esquema.safeParse({
    matriculaId: campo(fd, "matriculaId") ?? undefined,
    metodo: campo(fd, "metodo") ?? undefined,
    dataPagamento: campo(fd, "dataPagamento") ?? undefined,
    referencia: campo(fd, "referencia"),
    referenciaRecibo: campo(fd, "referenciaRecibo"),
    notas: campo(fd, "notas"),
  });
  const erros: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) erros[String(i.path[0])] ??= i.message;

  const valor = parseKz(campo(fd, "valor"));
  if (valor === null) erros.valor = "Indique um valor válido.";
  else if (valor <= 0n) erros.valor = "O valor tem de ser positivo.";

  let data: Date | null = null;
  if (r.success) {
    try {
      data = dataSimples(r.data.dataPagamento);
      if (data > dataSimples(hojeLocal())) erros.dataPagamento = "A data não pode ser futura.";
    } catch {
      erros.dataPagamento = "Data inválida.";
    }
  }

  if (!r.success || Object.keys(erros).length > 0 || valor === null || !data) {
    return { erro: "Verifique os campos assinalados.", erros };
  }
  const d = r.data;
  const valorPago: bigint = valor;
  const dataPagamento: Date = data;
  const tenantId = user.tenantId;

  try {
    await db.$transaction(async (tx) => {
      // Bloqueia a matrícula: pagamentos concorrentes são serializados e não alocam em excesso.
      await tx.$queryRaw`SELECT id FROM "Matricula" WHERE id = ${d.matriculaId} AND "tenantId" = ${tenantId} FOR UPDATE`;

      const matricula = await tx.matricula.findFirst({
        where: { id: d.matriculaId, formandoId },
        include: { parcelas: { include: { alocacoes: { select: { valor: true } } } } },
      });
      if (!matricula) throw new ErroNegocio("Matrícula não encontrada.");
      if (matricula.estado !== "ATIVA") throw new ErroNegocio("Só é possível registar pagamentos em matrículas ativas.");

      const parcelas = matricula.parcelas.map(comPago);
      const divida = parcelas.reduce((s, p) => s + (p.valor > p.pago ? p.valor - p.pago : 0n), 0n);
      if (divida === 0n) throw new ErroNegocio("Esta matrícula já está totalmente paga.");
      if (valorPago > divida) {
        throw new ErroNegocio(`O valor excede a dívida desta matrícula (${formatKz(divida)}).`);
      }

      const alocacoes = alocarPagamento(
        valorPago,
        parcelas.map((p) => ({ id: p.id, numero: p.numero, valor: p.valor, pago: p.pago })),
      );

      const pagamento = await tx.pagamento.create({
        data: {
          tenantId,
          formandoId,
          matriculaId: matricula.id,
          valor: valorPago,
          metodo: d.metodo,
          dataPagamento,
          referencia: d.referencia,
          referenciaRecibo: d.referenciaRecibo,
          notas: d.notas,
          registadoPorId: user.id,
          alocacoes: { create: alocacoes },
        },
        select: { id: true },
      });

      // Mensagens (confirmação / plano concluído) na mesma transação.
      await aoRegistarPagamento(comoCliente(tx), { tenantId, pagamentoId: pagamento.id });
    });
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    throw e;
  }

  revalidatePath("/formandos");
  revalidatePath(`/formandos/${formandoId}`);
  revalidatePath("/painel");
  redirect(`/formandos/${formandoId}`);
}
