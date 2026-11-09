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
    <div className="mt-2">
      {feedback?.ok && !aberto && (
        <div className="mb-2">
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
          className="min-h-9 px-3 text-xs"
        >
          {estadoAtual === "AGENDADA" ? (
            <>
              <CheckCircle2 className="size-3.5" aria-hidden /> Confirmar aula e horas
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
          className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left"
        >
          <div className="text-xs font-semibold text-slate-800">
            {estadoAtual === "AGENDADA"
              ? "Confirmar realização da sessão"
              : "Atualizar horas lecionadas e sumário"}
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

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variante="fantasma"
              onClick={() => setAberto(false)}
              className="min-h-8 px-2.5 text-xs"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente} className="min-h-8 px-3 text-xs">
              {pendente ? "A guardar…" : "Guardar confirmação"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
