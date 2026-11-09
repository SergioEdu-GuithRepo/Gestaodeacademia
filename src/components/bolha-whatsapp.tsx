import { Fragment, type ReactNode } from "react";
import { tokenizarWhatsapp, type Segmento } from "@/lib/configuracoes";
import { cn } from "@/lib/utils";

/**
 * Texto com formatação WhatsApp (*negrito*, _itálico_, ~riscado~, quebras de
 * linha) convertido em nós React — nunca injeta HTML.
 */
export function TextoWhatsapp({ texto }: { texto: string }) {
  return <>{renderSegmentos(tokenizarWhatsapp(texto))}</>;
}

function renderSegmentos(segs: Segmento[]): ReactNode[] {
  return segs.map((s, i) => {
    switch (s.tipo) {
      case "texto":
        return <Fragment key={i}>{s.texto}</Fragment>;
      case "quebra":
        return <br key={i} />;
      case "negrito":
        return <strong key={i}>{renderSegmentos(s.filhos)}</strong>;
      case "italico":
        return <em key={i}>{renderSegmentos(s.filhos)}</em>;
      case "riscado":
        return <s key={i}>{renderSegmentos(s.filhos)}</s>;
    }
  });
}

/** Balão de mensagem enviada, ao estilo do WhatsApp. */
export function BolhaWhatsapp({ texto, hora, className }: { texto: string; hora?: string; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-[#efeae2] p-3", className)}>
      <div className="ml-auto w-fit max-w-[90%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-sm leading-relaxed break-words text-slate-900 shadow-xs">
        {texto ? <TextoWhatsapp texto={texto} /> : <span className="text-slate-400 italic">(mensagem vazia)</span>}
        {hora && <div className="mt-1 text-right text-[11px] text-slate-500">{hora}</div>}
      </div>
    </div>
  );
}
