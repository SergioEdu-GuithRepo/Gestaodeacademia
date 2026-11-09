"use client";

import { useState, useTransition } from "react";
import { ModalConfirmacao } from "@/components/modal-confirmacao";
import { Button } from "@/components/ui";

/** Botão que executa uma server action (com confirmação opcional em modal editorial). */
export function BotaoMensagem({
  acao,
  rotulo,
  pendenteRotulo = "…",
  confirmar,
  variante = "secundario",
}: {
  acao: () => Promise<void>;
  rotulo: string;
  pendenteRotulo?: string;
  confirmar?: string;
  variante?: "primario" | "secundario" | "fantasma" | "perigo";
}) {
  const [modalAberto, setModalAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  function executar() {
    iniciar(async () => {
      await acao();
      setModalAberto(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variante={variante}
        disabled={pendente}
        onClick={() => {
          if (confirmar) {
            setModalAberto(true);
          } else {
            executar();
          }
        }}
        className="min-h-9 px-3"
      >
        {pendente ? pendenteRotulo : rotulo}
      </Button>
      {confirmar && (
        <ModalConfirmacao
          aberto={modalAberto}
          titulo="Confirmar ação"
          mensagem={confirmar}
          rotuloConfirmar={rotulo}
          pendente={pendente}
          aoCancelar={() => setModalAberto(false)}
          aoConfirmar={executar}
        />
      )}
    </>
  );
}
