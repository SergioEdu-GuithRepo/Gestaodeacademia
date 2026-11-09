import { Card, PageHeader } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { hojeLocal } from "@/lib/datas";
import { comoCliente, obterConfiguracao } from "@/lib/mensagens/config";
import { calcularSaldoPontos, campanhaVigenteNaData } from "@/lib/retencao";
import { MatriculaForm } from "./matricula-form";

export const metadata = { title: "Nova matrícula" };

type Params = Record<string, string | string[] | undefined>;

function um(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function NovaMatriculaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { user, db } = await exigir("matriculas:editar");
  const sp = await searchParams;
  const formandoId = um(sp.formandoId);
  const turmaId = um(sp.turmaId);
  const agora = new Date();

  const [formandosBrutos, turmas, campanhasBrutas, cfg] = await Promise.all([
    db.formando.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        whatsapp: true,
        movimentosPontos: { select: { pontos: true, createdAt: true, expiraEm: true } },
        _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } },
      },
    }),
    db.turma.findMany({
      where: { estado: { in: ["PLANEADA", "EM_CURSO"] } },
      orderBy: [{ formacao: { nome: "asc" } }, { codigo: "asc" }],
      select: {
        id: true,
        codigo: true,
        formacaoId: true,
        vagas: true,
        preco: true,
        estado: true,
        formacao: { select: { nome: true, preco: true } },
        _count: { select: { matriculas: { where: { estado: { not: "CANCELADA" } } } } },
      },
    }),
    db.campanha.findMany({
      where: { estado: { in: ["ATIVA", "ENVIADA"] }, descontoPct: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      include: {
        matriculas: {
          where: { estado: { not: "CANCELADA" } },
          select: { desconto: true },
        },
      },
    }),
    obterConfiguracao(comoCliente(db), user.tenantId),
  ]);

  const formandos = formandosBrutos.map((f) => ({
    id: f.id,
    nome: f.nome,
    whatsapp: f.whatsapp,
    formacoesAnteriores: f._count.matriculas,
    saldoPontos: calcularSaldoPontos(f.movimentosPontos, agora).saldoDisponivel,
  }));

  const campanhas = campanhasBrutas
    .filter((c) => campanhaVigenteNaData(c, agora))
    .map((c) => {
      const descontoConsumido = c.matriculas.reduce((acc, m) => acc + m.desconto, 0n);
      return {
        id: c.id,
        nome: c.nome,
        tipo: c.tipo,
        descontoPct: c.descontoPct,
        mesValidade: c.mesValidade,
        anoValidade: c.anoValidade,
        formacaoId: c.formacaoId,
        orcamentoMax: c.orcamentoMax !== null ? String(c.orcamentoMax) : null,
        descontoConsumido: String(descontoConsumido),
      };
    });

  const formandoValido = formandos.some((f) => f.id === formandoId) ? formandoId : "";
  const turmaValida = turmas.some((t) => t.id === turmaId) ? turmaId : "";
  // Vindo da turma (sem formando escolhido), volta à turma; caso contrário, à ficha do formando.
  const voltarPara = turmaValida && !formandoValido ? `/turmas/${turmaValida}` : "";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader titulo="Nova matrícula" descricao="Inscreva um formando numa turma e defina o plano de pagamento." />
      <Card>
        <MatriculaForm
          formandos={formandos}
          turmas={turmas.map((t) => ({
            id: t.id,
            codigo: t.codigo,
            formacaoId: t.formacaoId,
            formacao: t.formacao.nome,
            estado: t.estado,
            preco: String(t.preco ?? t.formacao.preco),
            vagas: t.vagas,
            ocupadas: t._count.matriculas,
          }))}
          campanhas={campanhas}
          regras={{
            descontoFidelizacaoPct: cfg.descontoFidelizacaoPct,
            pontosPorIndicacao: cfg.pontosPorIndicacao,
            percentagemPorPonto: cfg.percentagemPorPonto,
            limiteDescontoIndicacaoPct: cfg.limiteDescontoIndicacaoPct,
            validadePontosMeses: cfg.validadePontosMeses,
          }}
          formandoInicial={formandoValido}
          turmaInicial={turmaValida}
          hoje={hojeLocal()}
          voltarPara={voltarPara}
          cancelarHref={voltarPara || (formandoValido ? `/formandos/${formandoValido}` : "/formandos")}
        />
      </Card>
    </div>
  );
}
