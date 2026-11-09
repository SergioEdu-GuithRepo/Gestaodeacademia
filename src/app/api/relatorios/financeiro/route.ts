import { NextRequest, NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { dataSimples, formatData, hojeLocal } from "@/lib/datas";
import {
  calcularPagamentosFormadores,
  calcularResumoFinanceiro,
  gerarCsv,
  NOMES_CATEGORIA_DESPESA,
  type DespesaInput,
  type SessaoFinanceiraInput,
} from "@/lib/financeiro";
import { centimosParaInput } from "@/lib/money";
import { comPago, estadoParcela } from "@/lib/parcelas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, db } = await exigir("financeiro:ver");
  const url = req.nextUrl;
  const tipo = url.searchParams.get("tipo") ?? "movimentos";
  const deIso = url.searchParams.get("de") ?? "";
  const ateIso = url.searchParams.get("ate") ?? "";

  const dataDe = deIso && /^\d{4}-\d{2}-\d{2}$/.test(deIso) ? dataSimples(deIso) : undefined;
  const dataAte = ateIso && /^\d{4}-\d{2}-\d{2}$/.test(ateIso) ? dataSimples(ateIso) : undefined;
  const fimDiaAte = ateIso && /^\d{4}-\d{2}-\d{2}$/.test(ateIso) ? new Date(`${ateIso}T23:59:59.999Z`) : undefined;

  if (tipo === "atrasos") {
    const hoje = dataSimples(hojeLocal());
    const parcelas = await db.parcela.findMany({
      where: { matricula: { estado: { not: "CANCELADA" } } },
      orderBy: { vencimento: "asc" },
      include: {
        alocacoes: { select: { valor: true } },
        matricula: {
          select: {
            formando: { select: { nome: true, whatsapp: true, email: true } },
            turma: { select: { codigo: true, formacao: { select: { nome: true } } } },
          },
        },
      },
    });

    const linhas: (string | number)[][] = [];
    for (const p of parcelas) {
      const cp = comPago(p);
      const st = estadoParcela(cp, hoje);
      if (st !== "EM_ATRASO") continue;
      const emFalta = cp.valor > cp.pago ? cp.valor - cp.pago : 0n;
      linhas.push([
        formatData(p.vencimento),
        p.matricula.formando.nome,
        p.matricula.formando.whatsapp,
        p.matricula.turma.formacao.nome,
        p.matricula.turma.codigo,
        p.numero,
        centimosParaInput(cp.valor),
        centimosParaInput(cp.pago),
        centimosParaInput(emFalta),
      ]);
    }

    const csv = gerarCsv(
      [
        "Vencimento",
        "Formando",
        "WhatsApp",
        "Formação",
        "Turma",
        "Parcela N.º",
        "Valor Parcela (Kz)",
        "Valor Pago (Kz)",
        "Valor em Dívida (Kz)",
      ],
      linhas,
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="parcelas-atraso-${user.tenant.slug}.csv"`,
      },
    });
  }

  const [formacoes, precosOverrides, matriculas, pagamentos, despesas, sessoesPeriodo] = await Promise.all([
    db.formacao.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    db.precoFormadorFormacao.findMany({ select: { formadorId: true, formacaoId: true, precoHora: true } }),
    db.matricula.findMany({
      where: {
        ...(dataDe || fimDiaAte
          ? {
              createdAt: {
                ...(dataDe ? { gte: dataDe } : {}),
                ...(fimDiaAte ? { lte: fimDiaAte } : {}),
              },
            }
          : {}),
      },
      select: { valorTotal: true, estado: true, turma: { select: { formacaoId: true } } },
    }),
    db.pagamento.findMany({
      where: {
        ...(dataDe || dataAte
          ? {
              dataPagamento: {
                ...(dataDe ? { gte: dataDe } : {}),
                ...(dataAte ? { lte: dataAte } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ dataPagamento: "desc" }],
      include: {
        formando: { select: { nome: true } },
        matricula: {
          select: {
            turma: { select: { codigo: true, formacaoId: true, formacao: { select: { nome: true } } } },
          },
        },
      },
    }),
    db.despesa.findMany({
      where: {
        ...(dataDe || dataAte
          ? {
              data: {
                ...(dataDe ? { gte: dataDe } : {}),
                ...(dataAte ? { lte: dataAte } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ data: "desc" }],
      include: {
        formacao: { select: { nome: true } },
        turma: { select: { codigo: true } },
        formador: { select: { nome: true } },
      },
    }),
    db.sessao.findMany({
      where: {
        estado: "REALIZADA",
        ...(dataDe || fimDiaAte
          ? {
              inicio: {
                ...(dataDe ? { gte: dataDe } : {}),
                ...(fimDiaAte ? { lte: fimDiaAte } : {}),
              },
            }
          : {}),
      },
      include: {
        formador: {
          select: { id: true, nome: true, precoHoraComportamental: true, precoHoraTecnica: true },
        },
        turma: {
          select: {
            id: true,
            codigo: true,
            formacao: { select: { id: true, nome: true, categoria: true } },
          },
        },
      },
    }),
  ]);

  const mapaOverrides = new Map<string, bigint>();
  for (const ov of precosOverrides) {
    mapaOverrides.set(`${ov.formadorId}:${ov.formacaoId}`, ov.precoHora);
  }

  const sessoesInput: SessaoFinanceiraInput[] = sessoesPeriodo.map((s) => ({
    id: s.id,
    estado: s.estado,
    inicio: s.inicio,
    fim: s.fim,
    horasLecionadas: s.horasLecionadas ? Number(s.horasLecionadas.toString()) : null,
    formadorId: s.formador.id,
    formadorNome: s.formador.nome,
    formadorPrecos: {
      precoHoraComportamental: s.formador.precoHoraComportamental,
      precoHoraTecnica: s.formador.precoHoraTecnica,
    },
    formacaoId: s.turma.formacao.id,
    formacaoNome: s.turma.formacao.nome,
    formacaoCategoria: s.turma.formacao.categoria,
    turmaId: s.turma.id,
    turmaCodigo: s.turma.codigo,
    overridePrecoHora: mapaOverrides.get(`${s.formador.id}:${s.turma.formacao.id}`) ?? null,
  }));

  const despesasInput: DespesaInput[] = despesas.map((d) => ({
    id: d.id,
    categoria: d.categoria,
    valor: d.valor,
    data: d.data,
    formacaoId: d.formacaoId,
    turmaId: d.turmaId,
    formadorId: d.formadorId,
    horasPagas: d.horasPagas ? Number(d.horasPagas.toString()) : null,
  }));

  if (tipo === "formadores") {
    const lista = calcularPagamentosFormadores(sessoesInput, despesasInput);
    const csv = gerarCsv(
      ["Formador", "Sessões Realizadas", "Horas Lecionadas", "Valor Devido (Kz)", "Valor Pago (Kz)", "Em Falta (Kz)"],
      lista.map((r) => [
        r.formadorNome,
        r.sessoesRealizadas,
        String(r.horasLecionadas).replace(".", ","),
        centimosParaInput(r.valorDevido),
        centimosParaInput(r.valorPago),
        centimosParaInput(r.emFalta),
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="honorarios-formadores-${user.tenant.slug}.csv"`,
      },
    });
  }

  if (tipo === "formacoes") {
    const resumo = calcularResumoFinanceiro({
      formacoes,
      matriculas: matriculas.map((m) => ({
        formacaoId: m.turma.formacaoId,
        valorTotal: m.valorTotal,
        estado: m.estado,
      })),
      pagamentos: pagamentos.map((p) => ({
        formacaoId: p.matricula.turma.formacaoId,
        valor: p.valor,
      })),
      despesas: despesasInput,
      sessoesRealizadas: sessoesInput,
    });

    const csv = gerarCsv(
      [
        "Formação",
        "Matrículas Ativas",
        "Valor Contratado (Kz)",
        "Receita Recebida (Kz)",
        "Custo Formadores (Kz)",
        "Despesas Diretas (Kz)",
        "Custo Total (Kz)",
        "Margem Líquida (Kz)",
      ],
      resumo.porFormacao.map((f) => [
        f.formacaoNome,
        f.matriculasAtivas,
        centimosParaInput(f.valorContratado),
        centimosParaInput(f.receitaRecebida),
        centimosParaInput(f.custoFormadores),
        centimosParaInput(f.despesasDiretas),
        centimosParaInput(f.custoTotal),
        centimosParaInput(f.margem),
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rentabilidade-formacoes-${user.tenant.slug}.csv"`,
      },
    });
  }

  // Padrão: movimentos (entradas + saídas)
  const linhasMovimentos: (string | number)[][] = [
    ...pagamentos.map((p) => [
      formatData(p.dataPagamento),
      "ENTRADA",
      "Pagamento de formando",
      `${p.formando.nome} — ${p.matricula.turma.formacao.nome} (${p.matricula.turma.codigo})`,
      p.metodo,
      p.referenciaRecibo || p.referencia || "",
      centimosParaInput(p.valor),
    ]),
    ...despesas.map((d) => [
      formatData(d.data),
      "SAÍDA",
      NOMES_CATEGORIA_DESPESA[d.categoria],
      `${d.descricao}${d.fornecedor ? ` (${d.fornecedor})` : ""}`,
      d.metodo,
      d.referencia ?? "",
      `-${centimosParaInput(d.valor)}`,
    ]),
  ];

  const csv = gerarCsv(
    ["Data", "Tipo", "Categoria", "Descrição", "Método", "Referência / Recibo", "Valor (Kz)"],
    linhasMovimentos,
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimentos-financeiros-${user.tenant.slug}.csv"`,
    },
  });
}
