"use client";

import type { EstadoPresenca } from "@prisma/client";
import { CheckCircle2, Pencil, UsersRound } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Alerta, Button, Field, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { confirmarSessaoPortalAction } from "./actions";

export type AlunoChamadaPortal = {
  matriculaId: string;
  nome: string;
  estadoInicial: EstadoPresenca;
};

const OPCOES_PRESENCA: {
  valor: EstadoPresenca;
  rotulo: string;
  ativoClasse: string;
  pontoClasse: string;
}[] = [
  {
    valor: "PRESENTE",
    rotulo: "Presente",
    ativoClasse: "bg-[#E7F4E8] text-[#1E6332] ring-1 ring-[#288042]/35 font-semibold",
    pontoClasse: "bg-[#288042]",
  },
  {
    valor: "FALTA",
    rotulo: "Falta",
    ativoClasse: "bg-[#FDECEB] text-[#B42318] ring-1 ring-[#D92D20]/35 font-semibold",
    pontoClasse: "bg-[#D92D20]",
  },
  {
    valor: "JUSTIFICADA",
    rotulo: "Justificada",
    ativoClasse: "bg-[#FEF3C7] text-[#92400E] ring-1 ring-[#D97706]/35 font-semibold",
    pontoClasse: "bg-[#D97706]",
  },
];

function mapaInicialPresencas(alunos: AlunoChamadaPortal[]): Record<string, EstadoPresenca> {
  const mapa: Record<string, EstadoPresenca> = {};
  for (const a of alunos) {
    mapa[a.matriculaId] = a.estadoInicial ?? "PRESENTE";
  }
  return mapa;
}

export function FormConfirmarSessao({
  portalToken,
  sessaoId,
  estadoAtual,
  horasPadrao,
  notasAtuais,
  alunos = [],
}: {
  portalToken: string;
  sessaoId: string;
  estadoAtual: "AGENDADA" | "REALIZADA" | "CANCELADA";
  horasPadrao: number;
  notasAtuais: string | null;
  alunos?: AlunoChamadaPortal[];
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [feedback, setFeedback] = useState<{ ok?: string; erro?: string } | null>(null);
  const [presencas, setPresencas] = useState<Record<string, EstadoPresenca>>(() =>
    mapaInicialPresencas(alunos),
  );

  useEffect(() => {
    setPresencas(mapaInicialPresencas(alunos));
  }, [alunos]);

  if (estadoAtual === "CANCELADA") {
    return null;
  }

  function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setFeedback(null);
    iniciar(async () => {
      const res = await confirmarSessaoPortalAction(portalToken, sessaoId, fd);
      setFeedback(res);
      if (res.ok) {
        setAberto(false);
      }
    });
  }

  let contPresentes = 0;
  let contFaltas = 0;
  let contJustificadas = 0;
  for (const a of alunos) {
    const est = presencas[a.matriculaId] ?? a.estadoInicial ?? "PRESENTE";
    if (est === "PRESENTE") contPresentes++;
    else if (est === "JUSTIFICADA") contJustificadas++;
    else contFaltas++;
  }

  return (
    <div className="mt-3">
      {feedback?.ok && !aberto && (
        <div className="mb-2.5">
          <Alerta tipo="sucesso">{feedback.ok}</Alerta>
        </div>
      )}

      {!aberto ? (
        <Button
          type="button"
          variante={estadoAtual === "AGENDADA" ? "primario" : "secundario"}
          onClick={() => {
            setFeedback(null);
            setPresencas(mapaInicialPresencas(alunos));
            setAberto(true);
          }}
          className="min-h-9 px-3.5 text-xs"
        >
          {estadoAtual === "AGENDADA" ? (
            <>
              <CheckCircle2 className="size-3.5 text-[#FBD34D]" aria-hidden /> Confirmar aula, horas e chamada
            </>
          ) : (
            <>
              <Pencil className="size-3.5" aria-hidden /> Atualizar horas / chamada nominal
            </>
          )}
        </Button>
      ) : (
        <form
          onSubmit={submeter}
          className="anim-enter mt-3 space-y-4 rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] p-4 text-left"
        >
          <div className="flex items-center justify-between border-b border-dotted border-zinc-200 pb-2 text-xs font-bold tracking-wider text-[#1C1D21] uppercase">
            <span>
              {estadoAtual === "AGENDADA"
                ? "Confirmar realização da sessão e chamada"
                : "Atualizar horas, sumário e chamada nominal"}
            </span>
            <span className="size-2 rounded-full bg-[#FBD34D]" aria-hidden />
          </div>

          {feedback?.erro && <Alerta tipo="erro">{feedback.erro}</Alerta>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Horas lecionadas *" ajuda="Duração efetiva da sessão">
              <Input
                name="horasLecionadas"
                type="number"
                step="0.25"
                min="0.5"
                max="24"
                defaultValue={String(Math.round(horasPadrao * 100) / 100)}
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Sumário / Observações (opcional)">
                <Textarea
                  name="notas"
                  rows={2}
                  defaultValue={notasAtuais ?? ""}
                  placeholder="Ex.: Módulo 1 concluído; exercícios práticos realizados em grupo."
                />
              </Field>
            </div>
          </div>

          {/* Lista Nominal de Chamada */}
          <div className="space-y-2.5 border-t border-dotted border-zinc-200 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-[#1C1D21] uppercase">
                <UsersRound className="size-3.5 text-[#1C1D21]" aria-hidden />
                Chamada Nominal dos Formandos ({alunos.length})
              </div>

              {alunos.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-[#E7F4E8] px-2.5 py-0.5 font-semibold text-[#1E6332]">
                    {contPresentes} presente(s)
                  </span>
                  {contFaltas > 0 && (
                    <span className="rounded-full bg-[#FDECEB] px-2.5 py-0.5 font-semibold text-[#B42318]">
                      {contFaltas} falta(s)
                    </span>
                  )}
                  {contJustificadas > 0 && (
                    <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 font-semibold text-[#92400E]">
                      {contJustificadas} justificada(s)
                    </span>
                  )}
                  {(contFaltas > 0 || contJustificadas > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        const todos: Record<string, EstadoPresenca> = {};
                        for (const a of alunos) todos[a.matriculaId] = "PRESENTE";
                        setPresencas(todos);
                      }}
                      className="cursor-pointer rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-medium text-zinc-600 transition-colors hover:border-[#1C1D21] hover:text-[#1C1D21]"
                    >
                      Marcar todos presentes
                    </button>
                  )}
                </div>
              )}
            </div>

            {alunos.length === 0 ? (
              <p className="rounded-xl border border-zinc-200/70 bg-white px-3.5 py-2.5 text-xs text-zinc-500">
                Não existem formandos com matrícula ativa nesta turma.
              </p>
            ) : (
              <div className="divide-y divide-dotted divide-zinc-200 rounded-2xl border border-zinc-200/80 bg-white px-3.5 py-1">
                {alunos.map((aluno, idx) => {
                  const selecionado = presencas[aluno.matriculaId] ?? aluno.estadoInicial ?? "PRESENTE";
                  return (
                    <div
                      key={aluno.matriculaId}
                      className="flex flex-wrap items-center justify-between gap-2.5 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#F5F4EF] text-[11px] font-bold text-zinc-600">
                          {idx + 1}
                        </span>
                        <span className="truncate text-xs font-semibold text-[#1C1D21] sm:text-sm">
                          {aluno.nome}
                        </span>
                      </div>

                      <div
                        role="radiogroup"
                        aria-label={`Presença de ${aluno.nome}`}
                        className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#F5F4EF] p-1"
                      >
                        {OPCOES_PRESENCA.map((op) => {
                          const ativo = selecionado === op.valor;
                          return (
                            <label
                              key={op.valor}
                              className={cn(
                                "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all select-none",
                                ativo
                                  ? op.ativoClasse
                                  : "text-zinc-600 hover:bg-white/80 hover:text-[#1C1D21]",
                              )}
                            >
                              <input
                                type="radio"
                                name={`presenca_${aluno.matriculaId}`}
                                value={op.valor}
                                checked={ativo}
                                onChange={() =>
                                  setPresencas((ant) => ({
                                    ...ant,
                                    [aluno.matriculaId]: op.valor,
                                  }))
                                }
                                className="sr-only"
                              />
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  ativo ? op.pontoClasse : "bg-zinc-400",
                                )}
                                aria-hidden
                              />
                              {op.rotulo}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-dotted border-zinc-200 pt-3">
            <Button
              type="button"
              variante="secundario"
              onClick={() => setAberto(false)}
              className="min-h-8.5 px-3 text-xs"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente} className="min-h-8.5 px-3.5 text-xs">
              {pendente ? "A guardar…" : "Guardar confirmação"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export const FormConfirmarSessaoPortal = FormConfirmarSessao;
