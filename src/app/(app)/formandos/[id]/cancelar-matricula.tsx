"use client";

import { XCircle } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { cancelarMatricula } from "@/app/(app)/matriculas/actions";
import { ModalConfirmacao } from "@/components/modal-confirmacao";
import { Button } from "@/components/ui";

export function CancelarMatricula({ matriculaId, formando, turma }: { matriculaId: string; formando: string; turma: string }) {
  const [estado, acao, pendente] = useActionState(cancelarMatricula.bind(null, matriculaId), undefined);
  const [confirmar, setConfirmar] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={acao} className="flex items-center gap-2">
      {estado?.erro && <span className="text-xs text-red-600">{estado.erro}</span>}
      <Button
        type="button"
        variante="fantasma"
        disabled={pendente}
        onClick={() => setConfirmar(true)}
        className="text-red-700 hover:bg-red-50"
      >
        <XCircle className="size-4" aria-hidden /> {pendente ? "A cancelar…" : "Cancelar matrícula"}
      </Button>
      <ModalConfirmacao
        aberto={confirmar}
        titulo="Cancelar matrícula"
        mensagem={`Deseja cancelar a matrícula de ${formando} na turma ${turma}? As parcelas em falta deixam de contar como dívida.`}
        rotuloConfirmar="Cancelar matrícula"
        perigo
        pendente={pendente}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={() => {
          setConfirmar(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
