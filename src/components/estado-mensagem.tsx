import type { EstadoMensagem } from "@prisma/client";
import { CORES_ESTADO_MENSAGEM, NOMES_ESTADO_MENSAGEM } from "@/lib/configuracoes";
import { cn } from "@/lib/utils";

export function BadgeEstadoMensagem({ estado }: { estado: EstadoMensagem }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-transparent ring-inset",
        CORES_ESTADO_MENSAGEM[estado],
      )}
    >
      {NOMES_ESTADO_MENSAGEM[estado]}
    </span>
  );
}
