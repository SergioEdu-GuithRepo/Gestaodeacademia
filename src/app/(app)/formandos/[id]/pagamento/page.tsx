import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, PageHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { dataSimples, formatData, hojeLocal } from "@/lib/datas";
import { CORES_ESTADO_PARCELA, NOMES_ESTADO_PARCELA } from "@/lib/formandos";
import { centimosParaInput, formatKz } from "@/lib/money";
import { comPago, estadoParcela, resumirParcelas } from "@/lib/parcelas";
import { registarPagamento } from "./actions";
import { PagamentoForm } from "./pagamento-form";

export const metadata = { title: "Registar pagamento" };

export default async function RegistarPagamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { db } = await exigir("pagamentos:registar");
  const hoje = dataSimples(hojeLocal());

  const f = await db.formando.findFirst({
    where: { id },
    select: {
      id: true,
      nome: true,
      matriculas: {
        where: { estado: "ATIVA" },
        orderBy: { createdAt: "asc" },
        include: {
          turma: { select: { codigo: true, formacao: { select: { nome: true } } } },
          parcelas: { orderBy: { numero: "asc" }, include: { alocacoes: { select: { valor: true } } } },
        },
      },
    },
  });
  if (!f) notFound();

  const comDivida = f.matriculas
    .map((m) => {
      const parcelas = m.parcelas.map(comPago);
      return { ...m, parcelas, resumo: resumirParcelas(parcelas, hoje) };
    })
    .filter((m) => m.resumo.divida > 0n);

  const pedido = Array.isArray(sp.matriculaId) ? sp.matriculaId[0] : sp.matriculaId;
  const mat = comDivida.find((m) => m.id === pedido) ?? (comDivida.length === 1 ? comDivida[0] : undefined);

  if (!mat) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader titulo="Registar pagamento" descricao={f.nome} />
        <Card>
          <CardHeader titulo="Escolha a matrícula" />
          {comDivida.length === 0 ? (
            <Vazio>
              Este formando não tem matrículas ativas com valores em dívida.{" "}
              <Link href={`/formandos/${f.id}`} className="text-marca-700 hover:underline">
                Voltar à ficha
              </Link>
            </Vazio>
          ) : (
            <ul className="divide-y divide-slate-100">
              {comDivida.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/formandos/${f.id}/pagamento?matriculaId=${m.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <span>
                      <span className="block font-medium">{m.turma.formacao.nome}</span>
                      <span className="text-sm text-slate-500">Turma {m.turma.codigo}</span>
                    </span>
                    <span className="font-medium">{formatKz(m.resumo.divida)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  const proxima = mat.parcelas.find((p) => p.pago < p.valor);
  const valorSugerido = proxima ? proxima.valor - proxima.pago : mat.resumo.divida;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        titulo="Registar pagamento"
        descricao={`${f.nome} · ${mat.turma.formacao.nome} (${mat.turma.codigo})`}
      />

      <Card>
        <div className="grid grid-cols-3 gap-3 border-b border-slate-100 px-4 py-3 text-sm">
          <div>
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Total</div>
            <div className="font-medium">{formatKz(mat.resumo.total)}</div>
          </div>
          <div>
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Pago</div>
            <div className="font-medium">{formatKz(mat.resumo.pago)}</div>
          </div>
          <div>
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Em dívida</div>
            <div className={mat.resumo.parcelasEmAtraso > 0 ? "font-semibold text-red-600" : "font-semibold"}>
              {formatKz(mat.resumo.divida)}
            </div>
          </div>
        </div>
        <Tabela>
          <thead>
            <tr>
              <Th>N.º</Th>
              <Th>Vencimento</Th>
              <Th className="text-right">Valor</Th>
              <Th className="text-right">Em falta</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mat.parcelas.map((p) => {
              const e = estadoParcela(p, hoje);
              return (
                <tr key={p.id}>
                  <Td>{p.numero}</Td>
                  <Td className="whitespace-nowrap">{formatData(p.vencimento)}</Td>
                  <Td className="text-right whitespace-nowrap">{formatKz(p.valor)}</Td>
                  <Td className="text-right whitespace-nowrap">{formatKz(p.valor > p.pago ? p.valor - p.pago : 0n)}</Td>
                  <Td>
                    <Badge cor={CORES_ESTADO_PARCELA[e]}>{NOMES_ESTADO_PARCELA[e]}</Badge>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      </Card>

      <Card>
        <CardHeader
          titulo="Dados do pagamento"
          descricao="O valor abate as parcelas em aberto, da mais antiga para a mais recente."
        />
        <PagamentoForm
          acao={registarPagamento.bind(null, f.id)}
          matriculaId={mat.id}
          valorSugerido={centimosParaInput(valorSugerido)}
          dividaTexto={formatKz(mat.resumo.divida)}
          dividaCentimos={String(mat.resumo.divida)}
          hoje={hojeLocal()}
          cancelarHref={`/formandos/${f.id}`}
        />
      </Card>
    </div>
  );
}
