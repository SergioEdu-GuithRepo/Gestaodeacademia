import { ArrowRight, Calendar, Gift, Plus, Users } from "lucide-react";
import Link from "next/link";
import { GrelhaProgressiva } from "@/components/lista-progressiva";
import { Badge, Card, LinkButton, Vazio } from "@/components/ui";
import { exigir } from "@/lib/auth";
import { formatKz } from "@/lib/money";
import { pode } from "@/lib/rbac";
import { NOMES_MESES, campanhaVigenteNaData, validarOrcamentoCampanha } from "@/lib/retencao";
import {
  CORES_ESTADO_CAMPANHA,
  CORES_TIPO_CAMPANHA,
  NOMES_ESTADO_CAMPANHA,
  NOMES_TIPO_CAMPANHA,
  obterSobraOperacionalMesAtual,
} from "./segmento";

export const metadata = { title: "Campanhas" };

export default async function CampanhasPage() {
  const { user, db } = await exigir("campanhas:ver");
  const podeEditar = pode(user.perfil, "campanhas:editar");
  const agora = new Date();

  const [campanhas, margemMes] = await Promise.all([
    db.campanha.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        formacao: { select: { id: true, nome: true } },
        matriculas: {
          where: { estado: { not: "CANCELADA" } },
          select: { id: true, desconto: true, valorTotal: true, createdAt: true },
        },
      },
    }),
    obterSobraOperacionalMesAtual(db),
  ]);

  const campanhasAtivasNoMes = campanhas.filter((c) => campanhaVigenteNaData(c, agora)).length;

  let totalMatriculasConvertidas = 0;
  let totalReceitaConvertida = 0n;
  let totalDescontosConcedidos = 0n;

  for (const c of campanhas) {
    totalMatriculasConvertidas += c.matriculas.length;
    for (const m of c.matriculas) {
      totalReceitaConvertida += m.valorTotal;
      totalDescontosConcedidos += m.desconto;
    }
  }

  const validacaoGlobal = validarOrcamentoCampanha({
    descontojaConsumido: totalDescontosConcedidos,
    sobraOperacionalDisponivel: margemMes.sobraOperacional,
  });

  const nomeMesAtual = NOMES_MESES[margemMes.mesAtual] ?? String(margemMes.mesAtual);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Editorial */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Retenção & Promoções · {nomeMesAtual}/{margemMes.anoAtual}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1C1D21] sm:text-3xl">
            Campanhas e Retenção
          </h1>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href="/campanhas/nova">
              <Plus className="size-4" aria-hidden /> Nova campanha
            </LinkButton>
          </div>
        )}
      </div>

      {/* Bloco Editorial + 3 Pílulas Proporcionais (Referência 2) */}
      <div className="rounded-[26px] border border-[#E5E3DC] bg-white/95 p-5 shadow-[0_1px_2px_rgba(28,29,33,0.03),0_10px_28px_-14px_rgba(28,29,33,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="text-xs font-medium text-slate-500">Ativas em {nomeMesAtual}</div>
              <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
                {campanhasAtivasNoMes}{" "}
                <span className="text-sm font-medium text-slate-500">de {campanhas.length}</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Matrículas convertidas</div>
              <div className="mt-1 text-3xl font-light tracking-tight text-[#1C1D21] sm:text-4xl">
                {totalMatriculasConvertidas}{" "}
                <span className="text-sm font-medium text-emerald-700">({formatKz(totalReceitaConvertida)})</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Sobra operacional ({nomeMesAtual})</div>
              <div className="mt-1 text-2xl font-light tracking-tight text-[#1C1D21] sm:text-3xl">
                {formatKz(margemMes.sobraOperacional)}
              </div>
            </div>
          </div>

          <Badge cor={validacaoGlobal.cabeNaSobraOperacional ? "verde" : "amarelo"}>
            {validacaoGlobal.cabeNaSobraOperacional ? "Descontos dentro da margem" : "Acima da sobra operacional"}
          </Badge>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Campanhas ativas</span>
              <span className="font-semibold text-[#1C1D21]">{campanhasAtivasNoMes}</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#FBD34D] px-3.5 text-xs font-bold text-[#1C1D21]">
              <span>Vigentes em {nomeMesAtual}</span>
              <span>{campanhas.length} registadas</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Receita gerada</span>
              <span className="font-semibold text-[#1C1D21]">{totalMatriculasConvertidas} matrículas</span>
            </div>
            <div className="flex h-10 items-center justify-between rounded-2xl bg-[#1C1D21] px-3.5 text-xs font-semibold text-white">
              <span>Contratado</span>
              <span>{formatKz(totalReceitaConvertida)}</span>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Descontos concedidos</span>
              <span className="font-semibold text-[#1C1D21]">
                {validacaoGlobal.cabeNaSobraOperacional ? "Saudável" : "Atenção"}
              </span>
            </div>
            <div className="bg-hatched flex h-10 items-center justify-between rounded-2xl border border-[#E5E3DC] px-3.5 text-xs font-semibold text-[#1C1D21]">
              <span>Total descontos</span>
              <span>{formatKz(totalDescontosConcedidos)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grelha Progressiva de Campanhas (10 em 10) */}
      {campanhas.length === 0 ? (
        <Card>
          <Vazio>Ainda não foram criadas campanhas neste centro.</Vazio>
        </Card>
      ) : (
        <GrelhaProgressiva passo={10} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campanhas.map((c) => {
            const descontoConsumido = c.matriculas.reduce((acc, m) => acc + m.desconto, 0n);
            const validadeTexto =
              c.mesValidade && c.anoValidade
                ? `${NOMES_MESES[c.mesValidade] ?? c.mesValidade}/${c.anoValidade}`
                : "Contínua";
            const excedeuOrcamento = c.orcamentoMax !== null && descontoConsumido > c.orcamentoMax;
            const pctOrcamento =
              c.orcamentoMax !== null && c.orcamentoMax > 0n
                ? Math.min(100, Number((descontoConsumido * 100n) / c.orcamentoMax))
                : 0;

            return (
              <Link
                key={c.id}
                href={`/campanhas/${c.id}`}
                className="group flex flex-col justify-between rounded-[24px] border border-[#E5E3DC] bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#1C1D21]/30 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge cor={CORES_TIPO_CAMPANHA[c.tipo]}>{NOMES_TIPO_CAMPANHA[c.tipo]}</Badge>
                      <Badge cor={CORES_ESTADO_CAMPANHA[c.estado]}>{NOMES_ESTADO_CAMPANHA[c.estado]}</Badge>
                    </div>
                    {c.descontoPct > 0 && (
                      <span className="rounded-full bg-[#FBD34D] px-2.5 py-1 text-xs font-extrabold text-[#1C1D21]">
                        -{c.descontoPct}%
                      </span>
                    )}
                  </div>

                  <div className="mt-3.5 flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1C1D21] text-[#FBD34D] transition-colors group-hover:bg-[#FBD34D] group-hover:text-[#1C1D21]">
                      <Gift className="size-4.5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[#1C1D21] group-hover:underline">{c.nome}</h3>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        Formação: <strong className="text-slate-700">{c.formacao?.nome ?? "Todas as formações"}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#F8F7F3] p-3 text-xs">
                    <div>
                      <div className="flex items-center gap-1 text-slate-500">
                        <Calendar className="size-3 text-slate-400" aria-hidden />
                        <span>Validade</span>
                      </div>
                      <div className="mt-0.5 font-semibold text-[#1C1D21]">{validadeTexto}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-slate-500">
                        <Users className="size-3 text-slate-400" aria-hidden />
                        <span>Envios</span>
                      </div>
                      <div className="mt-0.5 font-semibold text-[#1C1D21]">{c.totalDestinatarios}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Convertidas</div>
                      <div className="mt-0.5 font-bold text-emerald-700">{c.matriculas.length}</div>
                    </div>
                  </div>

                  {/* Barra de Orçamento (Referência 2) */}
                  <div className="mt-3 rounded-2xl border border-[#ECEAE3] bg-white px-3.5 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Orçamento consumido</span>
                      <span className={excedeuOrcamento ? "font-bold text-red-600" : "font-semibold text-[#1C1D21]"}>
                        {formatKz(descontoConsumido)}{" "}
                        <span className="font-normal text-slate-400">
                          / {c.orcamentoMax !== null ? formatKz(c.orcamentoMax) : "Sem limite"}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[#ECEAE3]">
                      <div
                        className={excedeuOrcamento ? "bg-red-500" : "bg-[#FBD34D]"}
                        style={{ width: `${c.orcamentoMax !== null ? pctOrcamento : 35}%` }}
                      />
                      <div
                        className="bg-[#1C1D21]"
                        style={{ width: `${c.orcamentoMax !== null ? Math.max(0, 100 - pctOrcamento) : 65}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-dotted border-[#E2E0D8] pt-3 text-xs">
                  <span className="text-slate-500">Disparo e segmento</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#1C1D21] group-hover:translate-x-0.5 transition-transform">
                    Gerir campanha <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </div>
              </Link>
            );
          })}
        </GrelhaProgressiva>
      )}
    </div>
  );
}

