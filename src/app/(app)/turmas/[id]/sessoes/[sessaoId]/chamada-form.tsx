"use client";

import type { EstadoPresenca, EstadoSessao } from "@prisma/client";
import { Check, CheckCheck, Clock, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { registarChamadaSessaoAction } from "../../../actions";

export type AlunoChamadaItem = {
  matriculaId: string;
  formandoId: string;
  nome: string;
  whatsapp: string;
  profissao: string | null;
  estadoInicial: EstadoPresenca;
  observacaoInicial: string;
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export function ChamadaForm({
  turmaId,
  sessaoId,
  estadoSessao,
  duracaoPadraoHoras,
  horasLecionadasAtual,
  notasAtuais,
  alunos,
}: {
  turmaId: string;
  sessaoId: string;
  estadoSessao: EstadoSessao;
  duracaoPadraoHoras: number;
  horasLecionadasAtual: number | null;
  notasAtuais: string | null;
  alunos: AlunoChamadaItem[];
}) {
  const [estados, setEstados] = useState<Record<string, EstadoPresenca>>(() =>
    Object.fromEntries(alunos.map((a) => [a.matriculaId, a.estadoInicial])),
  );
  const [marcarRealizada, setMarcarRealizada] = useState(estadoSessao === "REALIZADA" || estadoSessao === "AGENDADA");

  const acao = registarChamadaSessaoAction.bind(null, turmaId, sessaoId);
  const { estado, pendente, onSubmit } = useFormAcao(acao);

  const valores = Object.values(estados);
  const totalPresentes = valores.filter((v) => v === "PRESENTE").length;
  const totalFaltas = valores.filter((v) => v === "FALTA").length;
  const totalJustificadas = valores.filter((v) => v === "JUSTIFICADA").length;

  function definirEstado(matriculaId: string, novo: EstadoPresenca) {
    setEstados((prev) => ({ ...prev, [matriculaId]: novo }));
  }

  function marcarTodosPresentes() {
    setEstados(Object.fromEntries(alunos.map((a) => [a.matriculaId, "PRESENTE" as EstadoPresenca])));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {estado?.ok && <Alerta tipo="sucesso">{estado.ok}</Alerta>}
      {estado?.erro && <Alerta tipo="erro">{estado.erro}</Alerta>}

      {/* Barra superior de resumo + ação rápida */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E3DC] bg-[#FAF9F5] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F4E8] px-3 py-1 text-[#1E6332]">
            <span className="size-1.5 rounded-full bg-[#288042]" aria-hidden />
            Presentes: {totalPresentes}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDECEB] px-3 py-1 text-[#B42318]">
            <span className="size-1.5 rounded-full bg-[#D92D20]" aria-hidden />
            Faltas: {totalFaltas}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-3 py-1 text-[#92400E]">
            <span className="size-1.5 rounded-full bg-[#D97706]" aria-hidden />
            Justificadas: {totalJustificadas}
          </span>
        </div>

        <button
          type="button"
          onClick={marcarTodosPresentes}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-3 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-colors hover:border-[#FBD34D] hover:bg-[#FBD34D]/40"
        >
          <CheckCheck className="size-3.5" aria-hidden /> Marcar todos presentes
        </button>
      </div>

      {/* Lista nominal de formandos */}
      <div className="divide-y divide-[#ECEAE3] rounded-2xl border border-[#E5E3DC] bg-white">
        {alunos.map((a, idx) => {
          const est = estados[a.matriculaId] ?? "PRESENTE";
          return (
            <div
              key={a.matriculaId}
              className="grid gap-3 p-4 transition-colors hover:bg-[#FAF9F5] lg:grid-cols-[minmax(0,1.1fr)_auto_minmax(220px,0.9fr)] lg:items-center"
            >
              <input type="hidden" name={`estado_${a.matriculaId}`} value={est} />

              {/* Aluno */}
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 shrink-0 font-mono text-xs font-semibold text-zinc-400">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    est === "PRESENTE"
                      ? "bg-[#1C1D21] text-[#FBD34D]"
                      : est === "FALTA"
                        ? "bg-[#FDECEB] text-[#B42318]"
                        : "bg-[#FEF3C7] text-[#92400E]",
                  )}
                >
                  {iniciais(a.nome)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#1C1D21]">{a.nome}</div>
                  <div className="truncate text-xs text-zinc-500">
                    {a.whatsapp}
                    {a.profissao ? ` · ${a.profissao}` : ""}
                  </div>
                </div>
              </div>

              {/* Pílulas de estado */}
              <div
                role="group"
                aria-label={`Assiduidade de ${a.nome}`}
                className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#F5F4EF] p-1"
              >
                <button
                  type="button"
                  onClick={() => definirEstado(a.matriculaId, "PRESENTE")}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold transition-all",
                    est === "PRESENTE"
                      ? "bg-[#1C1D21] text-[#FBD34D] shadow-2xs"
                      : "text-zinc-600 hover:text-[#1C1D21]",
                  )}
                >
                  <Check className="size-3.5" aria-hidden /> Presente
                </button>
                <button
                  type="button"
                  onClick={() => definirEstado(a.matriculaId, "FALTA")}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold transition-all",
                    est === "FALTA"
                      ? "bg-[#D92D20] text-white shadow-2xs"
                      : "text-zinc-600 hover:text-[#B42318]",
                  )}
                >
                  <X className="size-3.5" aria-hidden /> Falta
                </button>
                <button
                  type="button"
                  onClick={() => definirEstado(a.matriculaId, "JUSTIFICADA")}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold transition-all",
                    est === "JUSTIFICADA"
                      ? "bg-[#FBD34D] text-[#1C1D21] shadow-2xs"
                      : "text-zinc-600 hover:text-[#92400E]",
                  )}
                >
                  <ShieldAlert className="size-3.5" aria-hidden /> Justificada
                </button>
              </div>

              {/* Observação */}
              <div>
                <Input
                  name={`obs_${a.matriculaId}`}
                  defaultValue={a.observacaoInicial}
                  maxLength={300}
                  placeholder="Observação / motivo (opcional)"
                  aria-label={`Observação para ${a.nome}`}
                  className="min-h-9 text-xs"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmação de execução da aula */}
      <div className="rounded-2xl border border-[#E5E3DC] bg-[#FAF9F5] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-[#1C1D21]">
            <input
              type="checkbox"
              name="marcarRealizada"
              checked={marcarRealizada}
              onChange={(e) => setMarcarRealizada(e.target.checked)}
              className="size-4 rounded border-zinc-300 accent-[#1C1D21]"
            />
            <span>
              {estadoSessao === "REALIZADA"
                ? "Manter sessão confirmada como REALIZADA"
                : "Marcar também esta sessão como REALIZADA"}
            </span>
          </label>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            <Clock className="size-3.5" aria-hidden /> Duração prevista: {duracaoPadraoHoras} h
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label="Horas lecionadas" erro={estado?.erros?.horasLecionadas}>
            <Input
              name="horasLecionadas"
              inputMode="decimal"
              defaultValue={
                horasLecionadasAtual !== null
                  ? String(horasLecionadasAtual)
                  : String(Number(duracaoPadraoHoras.toFixed(2)))
              }
              disabled={!marcarRealizada && estadoSessao !== "REALIZADA"}
            />
          </Field>
          <Field label="Sumário / Notas da sessão (opcional)" erro={estado?.erros?.notasSessao}>
            <Textarea
              name="notasSessao"
              rows={2}
              defaultValue={notasAtuais ?? ""}
              maxLength={1000}
              placeholder="Conteúdos lecionados ou ocorrências em sala…"
              className="min-h-14"
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? "A guardar chamada…" : "Guardar chamada nominal"}
        </Button>
      </div>
    </form>
  );
}
