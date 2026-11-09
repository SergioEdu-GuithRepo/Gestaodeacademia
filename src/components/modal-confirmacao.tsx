"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui";

export function ModalConfirmacao({
  aberto,
  titulo = "Confirmar ação",
  mensagem,
  rotuloConfirmar = "Confirmar",
  rotuloCancelar = "Cancelar",
  perigo = false,
  pendente = false,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean;
  titulo?: string;
  mensagem: string;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  perigo?: boolean;
  pendente?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key === "Escape" && !pendente) aoCancelar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, pendente, aoCancelar]);

  if (!aberto || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-conf-titulo"
    >
      <div
        className="modal-backdrop fixed inset-0 bg-[#1C1D21]/40 backdrop-blur-xs"
        onClick={() => {
          if (!pendente) aoCancelar();
        }}
        aria-hidden
      />
      <div className="modal-painel relative z-10 w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white p-6 text-left shadow-2xl">
        <div className="flex items-start gap-4">
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
              perigo ? "bg-[#FDECEB] text-[#B42318]" : "bg-[#FBD34D] text-[#1C1D21]"
            }`}
          >
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="modal-conf-titulo" className="text-base font-semibold tracking-tight text-[#1C1D21]">
              {titulo}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{mensagem}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-dotted border-zinc-200 pt-4">
          <Button type="button" variante="secundario" disabled={pendente} onClick={aoCancelar}>
            {rotuloCancelar}
          </Button>
          <Button
            type="button"
            variante={perigo ? "perigo" : "primario"}
            disabled={pendente}
            onClick={aoConfirmar}
          >
            {pendente ? "A processar…" : rotuloConfirmar}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
