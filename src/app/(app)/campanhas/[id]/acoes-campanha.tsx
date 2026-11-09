"use client";

import { CopyPlus, Lock, Play, Send } from "lucide-react";
import { useState } from "react";
import { useFormAcao } from "@/components/form-acao";
import { ModalConfirmacao } from "@/components/modal-confirmacao";
import { Alerta, Button, Field, Input, Select } from "@/components/ui";
import { NOMES_MESES } from "@/lib/retencao";
import type { EstadoForm } from "@/lib/utils";

type Acao = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;

export function AcoesCampanha({
  estadoAtual,
  totalSegmento,
  mesAtualCampanha,
  anoCampanha,
  nomeCampanha,
  dispararAcao,
  repetirAcao,
  encerrarAcao,
  reativarAcao,
}: {
  estadoAtual: "RASCUNHO" | "ATIVA" | "ENVIADA" | "ENCERRADA";
  totalSegmento: number;
  mesAtualCampanha: number | null;
  anoCampanha: number;
  nomeCampanha: string;
  dispararAcao: Acao;
  repetirAcao: Acao;
  encerrarAcao: Acao;
  reativarAcao: Acao;
}) {
  const disp = useFormAcao(dispararAcao);
  const rep = useFormAcao(repetirAcao);
  const enc = useFormAcao(encerrarAcao);
  const reat = useFormAcao(reativarAcao);

  const [confirmarDisparo, setConfirmarDisparo] = useState(false);
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false);

  const mesSugerido = mesAtualCampanha ? (mesAtualCampanha % 12) + 1 : 1;
  const [mesDestino, setMesDestino] = useState<number>(mesSugerido);

  return (
    <div className="space-y-4">
      {/* 1. Disparar WhatsApp e Alterar Estado */}
      <div className="flex flex-wrap items-center gap-3">
        {estadoAtual !== "ENCERRADA" && (
          <form ref={disp.ref} onSubmit={disp.onSubmit}>
            <Button
              type="button"
              disabled={disp.pendente || totalSegmento === 0}
              onClick={() => setConfirmarDisparo(true)}
            >
              <Send className="size-4 text-[#FBD34D]" aria-hidden />
              {disp.pendente ? "A enfileirar mensagens…" : `Disparar campanha por WhatsApp (${totalSegmento})`}
            </Button>
            <ModalConfirmacao
              aberto={confirmarDisparo}
              titulo="Disparar campanha por WhatsApp"
              mensagem={`Deseja enviar a campanha "${nomeCampanha}" por WhatsApp para ${totalSegmento} formando(s) do segmento selecionado?`}
              rotuloConfirmar="Disparar mensagens"
              pendente={disp.pendente}
              aoCancelar={() => setConfirmarDisparo(false)}
              aoConfirmar={() => {
                setConfirmarDisparo(false);
                disp.ref.current?.requestSubmit();
              }}
            />
          </form>
        )}

        {estadoAtual !== "ENCERRADA" ? (
          <form ref={enc.ref} onSubmit={enc.onSubmit}>
            <Button
              type="button"
              variante="secundario"
              disabled={enc.pendente}
              onClick={() => setConfirmarEncerrar(true)}
            >
              <Lock className="size-4" aria-hidden />
              {enc.pendente ? "A encerrar…" : "Encerrar campanha"}
            </Button>
            <ModalConfirmacao
              aberto={confirmarEncerrar}
              titulo="Encerrar campanha"
              mensagem={`Deseja encerrar a campanha "${nomeCampanha}"? Deixará de estar disponível para novas matrículas.`}
              rotuloConfirmar="Encerrar campanha"
              pendente={enc.pendente}
              aoCancelar={() => setConfirmarEncerrar(false)}
              aoConfirmar={() => {
                setConfirmarEncerrar(false);
                enc.ref.current?.requestSubmit();
              }}
            />
          </form>
        ) : (
          <form ref={reat.ref} onSubmit={reat.onSubmit}>
            <Button type="submit" variante="secundario" disabled={reat.pendente}>
              <Play className="size-4" aria-hidden />
              {reat.pendente ? "A reativar…" : "Reativar campanha"}
            </Button>
          </form>
        )}
      </div>

      {disp.estado?.erro && <Alerta>{disp.estado.erro}</Alerta>}
      {disp.estado?.ok && <Alerta tipo="sucesso">{disp.estado.ok}</Alerta>}
      {enc.estado?.erro && <Alerta>{enc.estado.erro}</Alerta>}
      {enc.estado?.ok && <Alerta tipo="sucesso">{enc.estado.ok}</Alerta>}
      {reat.estado?.erro && <Alerta>{reat.estado.erro}</Alerta>}
      {reat.estado?.ok && <Alerta tipo="sucesso">{reat.estado.ok}</Alerta>}

      {/* 2. Repetir campanha noutro mês do mesmo ano */}
      <details className="rounded-2xl border border-zinc-200/80 bg-[#FAF9F5] p-4">
        <summary className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#1C1D21] hover:underline">
          <CopyPlus className="size-4" aria-hidden />
          Repetir campanha noutro mês ({anoCampanha})
        </summary>
        <form ref={rep.ref} onSubmit={rep.onSubmit} className="mt-3 space-y-3">
          <p className="text-xs text-zinc-600">
            Cria uma cópia ativa desta campanha para outro mês de {anoCampanha}, mantendo o desconto, orçamento, filtros de segmentação e modelo de mensagem.
          </p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
            <Field label={`Mês de destino (${anoCampanha})`} htmlFor="rep-mes">
              <Select
                id="rep-mes"
                name="mesValidade"
                value={mesDestino}
                onChange={(ev) => setMesDestino(Number(ev.target.value))}
              >
                {Object.entries(NOMES_MESES).map(([m, label]) => (
                  <option key={m} value={m} disabled={Number(m) === mesAtualCampanha}>
                    {label} {Number(m) === mesAtualCampanha ? "(mês atual da campanha)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nome da nova campanha (opcional)" htmlFor="rep-nome">
              <Input
                id="rep-nome"
                name="nome"
                maxLength={150}
                placeholder={`${nomeCampanha} (${NOMES_MESES[mesDestino]}/${anoCampanha})`}
              />
            </Field>
            <Button type="submit" variante="secundario" disabled={rep.pendente}>
              {rep.pendente ? "A clonar…" : "Repetir noutro mês"}
            </Button>
          </div>
          {rep.estado?.erro && <Alerta>{rep.estado.erro}</Alerta>}
        </form>
      </details>
    </div>
  );
}
