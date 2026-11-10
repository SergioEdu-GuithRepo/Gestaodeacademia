"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

export function BotaoImprimir({
  rotulo = "Imprimir / Guardar PDF (A4)",
  variante = "primario",
}: {
  rotulo?: string;
  variante?: "primario" | "secundario";
}) {
  return (
    <Button type="button" variante={variante} onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4 text-[#FBD34D]" aria-hidden />
      {rotulo}
    </Button>
  );
}
