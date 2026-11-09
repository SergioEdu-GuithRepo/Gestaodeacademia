import { NextResponse, type NextRequest } from "next/server";
import { utilizadorAtual } from "@/lib/auth";
import { dataSimples, hojeLocal } from "@/lib/datas";
import { dbTenant } from "@/lib/db";
import { formatKz } from "@/lib/money";
import { comPago, resumirParcelas } from "@/lib/parcelas";
import { pode } from "@/lib/rbac";

/**
 * Pesquisa rápida de formandos (tipo "chat de busca").
 * Devolve de imediato a ficha, as turmas em que está inscrito e o estado de pagamentos.
 */
export async function GET(req: NextRequest) {
  const user = await utilizadorAtual();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  if (!pode(user.perfil, "formandos:ver")) return NextResponse.json({ resultados: [] });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ resultados: [] });

  const db = dbTenant({ tenantId: user.tenantId, userId: user.id });
  const digitos = q.replace(/\D/g, "");
  const formandos = await db.formando.findMany({
    where: {
      OR: [
        { nome: { contains: q, mode: "insensitive" } },
        ...(digitos.length >= 3 ? [{ whatsapp: { contains: digitos } }] : []),
      ],
    },
    take: 8,
    orderBy: { nome: "asc" },
    include: {
      matriculas: {
        where: { estado: { not: "CANCELADA" } },
        include: {
          turma: { select: { codigo: true, formacao: { select: { nome: true } } } },
          parcelas: { include: { alocacoes: { select: { valor: true } } } },
        },
      },
    },
  });

  const hoje = dataSimples(hojeLocal());
  const verPagamentos = pode(user.perfil, "pagamentos:ver");
  const resultados = formandos.map((f) => {
    const resumo = resumirParcelas(
      f.matriculas.flatMap((m) => m.parcelas.map(comPago)),
      hoje,
    );
    return {
      id: f.id,
      nome: f.nome,
      whatsapp: f.whatsapp,
      profissao: f.profissao,
      turmas: f.matriculas.map((m) => `${m.turma.formacao.nome} · ${m.turma.codigo}`),
      pagamentos: verPagamentos
        ? {
            divida: formatKz(resumo.divida),
            emDivida: resumo.divida > 0n,
            parcelasEmFalta: resumo.parcelasEmFalta,
            parcelasEmAtraso: resumo.parcelasEmAtraso,
          }
        : null,
    };
  });

  return NextResponse.json({ resultados });
}
