"use client";

import { CheckCircle2, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { Alerta, Button, Field, Input, Textarea } from "@/components/ui";
import { confirmarSessaoPortalAction } from "./actions";

export function FormConfirmarSessaoPortal({
  portalToken,
  sessaoId,
  estadoAtual,
  horasPadrao,
  notasAtuais,
}: {
  portalToken: string;
  sessaoId: string;
  estadoAtual: "AGENDADA" | "REALIZADA" | "CANCELADA";
  horasPadrao: number;
  notasAtuais: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [feedback, setFeedback] = useState<{ ok?: string; erro?: string } | null>(null);

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
            setAberto(true);
          }}
          className="min-h-9 px-3.5 text-xs"
        >
          {estadoAtual === "AGENDADA" ? (
            <>
              <CheckCircle2 className="size-3.5 text-[#FBD34D]" aria-hidden /> Confirmar aula e horas
            </>
          ) : (
            <>
              <Pencil className="size-3.5" aria-hidden /> Atualizar horas / sumário
            </>
          )}
        </Button>
      ) : (
        <form
          onSubmit={submeter}
          className="anim-enter mt-3 space-y-3.5 rounded-2xl border border-zinc-200/90 bg-[#FAF9F5] p-4 text-left"
        >
          <div className="flex items-center justify-between border-b border-dotted border-zinc-200 pb-2 text-xs font-bold tracking-wider text-[#1C1D21] uppercase">
            <span>
              {estadoAtual === "AGENDADA"
                ? "Confirmar realização da sessão"
                : "Atualizar horas lecionadas e sumário"}
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
