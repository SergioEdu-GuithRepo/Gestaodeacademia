"use client";

import { Check, Copy, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ModalConfirmacao } from "@/components/modal-confirmacao";
import { enviarLinkPortalAction, regenerarTokenPortalAction } from "./actions";

export function BotoesPortal({
  tipo,
  id,
  nome,
  portalToken,
  temTelefone,
  compacto = false,
}: {
  tipo: "formador" | "formando";
  id: string;
  nome: string;
  portalToken: string;
  temTelefone: boolean;
  compacto?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const [confirmarRegen, setConfirmarRegen] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok?: string; erro?: string } | null>(null);

  const caminho = `/portal/${tipo}/${portalToken}`;

  async function copiarLink() {
    try {
      const url = `${window.location.origin}${caminho}`;
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setAviso({ erro: "Não foi possível copiar automaticamente." });
    }
  }

  function enviarWhatsapp() {
    setAviso(null);
    iniciar(async () => {
      const res = await enviarLinkPortalAction(tipo, id, window.location.origin);
      setAviso(res);
    });
  }

  function confirmarRegenerar() {
    setAviso(null);
    iniciar(async () => {
      const res = await regenerarTokenPortalAction(tipo, id);
      setAviso(res);
      setConfirmarRegen(false);
    });
  }

  const altura = compacto ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-xs";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={caminho}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-full bg-[#1C1D21] font-medium text-white shadow-2xs transition-colors hover:bg-zinc-800 ${altura}`}
        >
          <ExternalLink className="size-3" aria-hidden />
          Portal ↗
        </Link>

        <button
          type="button"
          onClick={copiarLink}
          className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white font-medium text-[#1C1D21] shadow-2xs transition-colors hover:bg-zinc-50 ${altura}`}
          title="Copiar link direto do portal"
        >
          {copiado ? (
            <>
              <Check className="size-3 text-emerald-600" aria-hidden /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-3 text-zinc-500" aria-hidden /> Copiar
            </>
          )}
        </button>

        {temTelefone && (
          <button
            type="button"
            disabled={pendente}
            onClick={enviarWhatsapp}
            className={`inline-flex items-center gap-1.5 rounded-full bg-[#FBD34D] font-semibold text-[#1C1D21] shadow-2xs transition-colors hover:bg-[#f5c82e] disabled:opacity-50 ${altura}`}
            title="Enviar link pessoal por WhatsApp"
          >
            <MessageCircle className="size-3" aria-hidden />
            WhatsApp
          </button>
        )}

        <button
          type="button"
          disabled={pendente}
          onClick={() => setConfirmarRegen(true)}
          className="inline-flex size-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
          title="Regenerar token secreto (invalida o link anterior)"
        >
          <RefreshCw className="size-3.5" aria-hidden />
        </button>
      </div>

      <ModalConfirmacao
        aberto={confirmarRegen}
        titulo="Gerar novo link de portal"
        mensagem={`Deseja gerar um novo link pessoal de portal para ${nome}? O link anterior deixará de funcionar imediatamente.`}
        rotuloConfirmar="Gerar novo link"
        pendente={pendente}
        aoCancelar={() => setConfirmarRegen(false)}
        aoConfirmar={confirmarRegenerar}
      />

      {aviso?.ok && <p className="text-xs font-medium text-emerald-700">{aviso.ok}</p>}
      {aviso?.erro && <p className="text-xs font-medium text-red-600">{aviso.erro}</p>}
    </div>
  );
}
