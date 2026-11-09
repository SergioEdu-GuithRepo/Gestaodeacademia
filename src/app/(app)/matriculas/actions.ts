"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { dataSimples, hojeLocal } from "@/lib/datas";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { aoRegistarPagamento } from "@/lib/mensagens/eventos";
import { parseKz } from "@/lib/money";
import { alocarPagamento, gerarParcelas } from "@/lib/parcelas";
import {
  calcularDescontoFidelizacao,
  calcularDescontoPontos,
  calcularExpiracaoPontos,
  calcularSaldoPontos,
  campanhaVigenteNaData,
  consolidarDescontosMatricula,
} from "@/lib/retencao";
import { campo, type EstadoForm } from "@/lib/utils";

/** Erro de regra de negócio, com mensagem para mostrar ao utilizador. */
class ErroNegocio extends Error {}

const METODOS = ["MULTICAIXA", "REFERENCIA", "TRANSFERENCIA", "NUMERARIO", "TPA", "OUTRO"] as const;

const esquema = z.object({
  formandoId: z.string({ required_error: "Escolha o formando." }).min(1, "Escolha o formando."),
  turmaId: z.string({ required_error: "Escolha a turma." }).min(1, "Escolha a turma."),
  numParcelas: z.coerce
    .number({ invalid_type_error: "Plano inválido." })
    .int("Plano inválido.")
    .min(1, "Plano inválido.")
    .max(12, "No máximo 12 parcelas."),
  dataPrimeira: z.string({ required_error: "Indique a data da 1.ª parcela." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  pagarJa: z.boolean(),
  metodo: z.enum(METODOS).nullable(),
  referencia: z.string().max(120).nullable(),
  referenciaRecibo: z.string().max(120).nullable(),
  ignorarVagas: z.boolean(),
});

function destinoSeguro(v: string | null, formandoId: string) {
  if (v && /^\/(turmas|formandos)\/[\w-]+$/.test(v)) return v;
  return `/formandos/${formandoId}`;
}

export async function criarMatricula(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { user, db } = await exigir("matriculas:editar");

  const r = esquema.safeParse({
    formandoId: campo(fd, "formandoId") ?? undefined,
    turmaId: campo(fd, "turmaId") ?? undefined,
    numParcelas: campo(fd, "numParcelas") ?? undefined,
    dataPrimeira: campo(fd, "dataPrimeira") ?? undefined,
    pagarJa: fd.get("pagarJa") === "on",
    metodo: campo(fd, "metodo"),
    referencia: campo(fd, "referencia"),
    referenciaRecibo: campo(fd, "referenciaRecibo"),
    ignorarVagas: fd.get("ignorarVagas") === "on",
  });
  const erros: Record<string, string> = {};
  if (!r.success) {
    for (const i of r.error.issues) erros[String(i.path[0])] ??= i.message;
  }

  const descontoTxt = campo(fd, "desconto");
  const desconto = descontoTxt ? parseKz(descontoTxt) : 0n;
  if (desconto === null) erros.desconto = "Valor inválido.";

  const aplicarFidelizacao = fd.get("aplicarFidelizacao") === "on";
  const campanhaId = campo(fd, "campanhaId");
  const pontosTxt = campo(fd, "pontosResgatados");
  const pontosSolicitados = pontosTxt ? Math.max(0, Math.floor(Number(pontosTxt) || 0)) : 0;

  let primeira: Date | null = null;
  if (r.success) {
    try {
      primeira = dataSimples(r.data.dataPrimeira);
    } catch {
      erros.dataPrimeira = "Data inválida.";
    }
    if (r.data.pagarJa && !r.data.metodo) erros.metodo = "Indique o método de pagamento.";
  }

  if (!r.success || Object.keys(erros).length > 0 || !primeira || desconto === null) {
    return { erro: "Verifique os campos assinalados.", erros };
  }
  const d = r.data;
  const dataPrimeira: Date = primeira;
  const valorDescontoManual: bigint = desconto;
  const tenantId = user.tenantId;
  const hoje = dataSimples(hojeLocal());
  const agora = new Date();
  let indicadoPorRevalidar: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      // Bloqueia a turma para que a verificação de vagas não sofra corridas.
      await tx.$queryRaw`SELECT id FROM "Turma" WHERE id = ${d.turmaId} AND "tenantId" = ${tenantId} FOR UPDATE`;

      const [turma, formando, cfg] = await Promise.all([
        tx.turma.findFirst({
          where: { id: d.turmaId },
          include: {
            formacao: { select: { id: true, preco: true } },
            _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } },
          },
        }),
        tx.formando.findFirst({
          where: { id: d.formandoId },
          select: {
            id: true,
            nome: true,
            indicadoPorId: true,
            movimentosPontos: { select: { pontos: true, createdAt: true, expiraEm: true } },
            _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } },
          },
        }),
        obterConfiguracao(comoCliente(tx), tenantId),
      ]);
      if (!formando) throw new ErroNegocio("Formando não encontrado.");
      if (!turma) throw new ErroNegocio("Turma não encontrada.");
      if (turma.estado !== "PLANEADA" && turma.estado !== "EM_CURSO") {
        throw new ErroNegocio("Só é possível matricular em turmas planeadas ou em curso.");
      }
      if (turma.vagas !== null && turma._count.matriculas >= turma.vagas && !d.ignorarVagas) {
        throw new ErroNegocio(
          `A turma ${turma.codigo} já tem as ${turma.vagas} vagas preenchidas. Confirme para matricular mesmo assim.`,
        );
      }

      const precoBase = turma.preco ?? turma.formacao.preco;
      if (valorDescontoManual < 0n || valorDescontoManual >= precoBase) {
        throw new ErroNegocio("O desconto tem de ser inferior ao preço.");
      }

      // 1. Fidelização
      const fid = aplicarFidelizacao
        ? calcularDescontoFidelizacao({
            precoBase,
            formacoesAnteriores: formando._count.matriculas,
            descontoFidelizacaoPct: cfg.descontoFidelizacaoPct,
          })
        : { elegivel: false, percentagem: 0, valorDesconto: 0n };

      // 2. Campanha
      let campanhaValidaId: string | null = null;
      let descontoCampanha = 0n;
      let orcamentoMaxCampanha: bigint | null = null;
      let descontoJaConsumidoCampanha = 0n;

      if (campanhaId) {
        const camp = await tx.campanha.findFirst({
          where: { id: campanhaId },
          include: {
            matriculas: {
              where: { estado: { not: "CANCELADA" } },
              select: { desconto: true },
            },
          },
        });
        if (!camp || !campanhaVigenteNaData(camp, agora, turma.formacaoId)) {
          throw new ErroNegocio("A campanha selecionada não está vigente para esta formação ou mês.");
        }
        campanhaValidaId = camp.id;
        orcamentoMaxCampanha = camp.orcamentoMax;
        descontoJaConsumidoCampanha = camp.matriculas.reduce((acc, m) => acc + m.desconto, 0n);
        const pct = Math.min(100, Math.max(0, camp.descontoPct));
        descontoCampanha = (precoBase * BigInt(pct)) / 100n;
      }

      // 3. Pontos de indicação
      const { saldoDisponivel } = calcularSaldoPontos(formando.movimentosPontos, agora);
      const pts = calcularDescontoPontos({
        precoBase,
        saldoPontos: saldoDisponivel,
        pontosSolicitados,
        percentagemPorPonto: cfg.percentagemPorPonto,
        limiteDescontoIndicacaoPct: cfg.limiteDescontoIndicacaoPct,
      });

      // 4. Consolidação de descontos
      const { descontoTotal, valorFinal } = consolidarDescontosMatricula({
        precoBase,
        descontoFidelizacao: fid.valorDesconto,
        descontoCampanha,
        descontoPontos: pts.valorDesconto,
        descontoManual: valorDescontoManual,
      });

      if (valorFinal <= 0n) {
        throw new ErroNegocio("O desconto total tem de ser inferior ao preço da formação.");
      }

      if (orcamentoMaxCampanha !== null && descontoJaConsumidoCampanha + descontoTotal > orcamentoMaxCampanha) {
        throw new ErroNegocio("O orçamento máximo desta campanha foi atingido.");
      }

      const plano = gerarParcelas(valorFinal, d.numParcelas, dataPrimeira);

      const matricula = await tx.matricula.create({
        data: {
          tenantId,
          formandoId: formando.id,
          turmaId: turma.id,
          valorTotal: valorFinal,
          desconto: descontoTotal,
          numParcelas: d.numParcelas,
          campanhaId: campanhaValidaId,
          pontosResgatados: pts.pontosUsados,
          parcelas: { create: plano.map((p) => ({ ...p, tenantId })) },
        },
        include: { parcelas: { orderBy: { numero: "asc" } } },
      });

      // Regista o resgate de pontos se usado
      if (pts.pontosUsados > 0) {
        await tx.movimentoPontos.create({
          data: {
            tenantId,
            formandoId: formando.id,
            pontos: -pts.pontosUsados,
            motivo: `Resgate de pontos na matrícula (${turma.codigo})`,
            matriculaId: matricula.id,
          },
        });
      }

      // Crédito automático de pontos ao indicador (uma única vez por formando indicado)
      if (formando.indicadoPorId && formando.indicadoPorId !== formando.id && cfg.pontosPorIndicacao > 0) {
        const jaCreditado = await tx.movimentoPontos.findFirst({
          where: {
            tenantId,
            formandoId: formando.indicadoPorId,
            indicadoId: formando.id,
          },
          select: { id: true },
        });
        if (!jaCreditado) {
          await tx.movimentoPontos.create({
            data: {
              tenantId,
              formandoId: formando.indicadoPorId,
              pontos: cfg.pontosPorIndicacao,
              motivo: `Indicação de ${formando.nome} (${turma.codigo})`,
              indicadoId: formando.id,
              matriculaId: matricula.id,
              expiraEm: calcularExpiracaoPontos(agora, cfg.validadePontosMeses),
            },
          });
          indicadoPorRevalidar = formando.indicadoPorId;
        }
      }

      if (d.pagarJa && d.metodo) {
        const p1 = matricula.parcelas[0];
        const alocacoes = alocarPagamento(p1.valor, [{ id: p1.id, numero: p1.numero, valor: p1.valor, pago: 0n }]);
        const pagamento = await tx.pagamento.create({
          data: {
            tenantId,
            formandoId: formando.id,
            matriculaId: matricula.id,
            valor: p1.valor,
            metodo: d.metodo,
            dataPagamento: hoje,
            referencia: d.referencia,
            referenciaRecibo: d.referenciaRecibo,
            registadoPorId: user.id,
            alocacoes: { create: alocacoes },
          },
          select: { id: true },
        });

        // Mensagens (confirmação / plano concluído) na mesma transação.
        await aoRegistarPagamento(comoCliente(tx), { tenantId, pagamentoId: pagamento.id });
      }
    });
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        erro: "Este formando já tem uma matrícula nesta turma (pode estar cancelada).",
        erros: { turmaId: "Já matriculado nesta turma." },
      };
    }
    throw e;
  }

  revalidatePath("/formandos");
  revalidatePath(`/formandos/${d.formandoId}`);
  if (indicadoPorRevalidar) revalidatePath(`/formandos/${indicadoPorRevalidar}`);
  revalidatePath(`/turmas/${d.turmaId}`);
  revalidatePath("/turmas");
  revalidatePath("/campanhas");
  if (campanhaId) revalidatePath(`/campanhas/${campanhaId}`);
  revalidatePath("/painel");
  redirect(destinoSeguro(campo(fd, "voltarPara"), d.formandoId));
}

export async function cancelarMatricula(matriculaId: string, _prev: EstadoForm, _fd: FormData): Promise<EstadoForm> {
  void _fd;
  const { db } = await exigir("matriculas:editar");
  const m = await db.matricula.findFirst({ where: { id: matriculaId }, select: { id: true, estado: true, formandoId: true, turmaId: true } });
  if (!m) return { erro: "Matrícula não encontrada." };
  if (m.estado === "CANCELADA") return { erro: "A matrícula já está cancelada." };

  await db.matricula.update({ where: { id: m.id }, data: { estado: "CANCELADA" } });

  revalidatePath("/formandos");
  revalidatePath(`/formandos/${m.formandoId}`);
  revalidatePath(`/turmas/${m.turmaId}`);
  revalidatePath("/painel");
  return { ok: "Matrícula cancelada." };
}
