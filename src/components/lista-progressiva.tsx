"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Children, type ReactNode, useState } from "react";

export function TbodyProgressivo({
  children,
  passo = 10,
  colSpan = 10,
  className,
}: {
  children: ReactNode;
  passo?: number;
  colSpan?: number;
  className?: string;
}) {
  const itens = Children.toArray(children);
  const [visiveis, setVisiveis] = useState(passo);

  const total = itens.length;
  const mostrados = Math.min(visiveis, total);
  const restam = total - mostrados;

  return (
    <>
      <tbody className={className}>{itens.slice(0, mostrados)}</tbody>
      {total > passo && (
        <tfoot className="print:hidden">
          <tr>
            <td colSpan={colSpan} className="pt-4 pb-1 text-center">
              <div className="inline-flex flex-wrap items-center justify-center gap-2">
                {restam > 0 && (
                  <button
                    type="button"
                    onClick={() => setVisiveis((v) => Math.min(total, v + passo))}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-zinc-200/90 bg-[#FAF9F5] px-4 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#FBD34D] hover:bg-[#FBD34D] hover:shadow-xs active:scale-[0.98]"
                  >
                    <ChevronDown className="size-3.5" aria-hidden />
                    Ver mais {Math.min(passo, restam)} ({mostrados} de {total})
                  </button>
                )}
                {mostrados > passo && (
                  <button
                    type="button"
                    onClick={() => setVisiveis(passo)}
                    className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-medium text-zinc-500 transition-all duration-200 hover:bg-zinc-100 hover:text-[#1C1D21] active:scale-[0.98]"
                  >
                    <ChevronUp className="size-3.5" aria-hidden />
                    Recolher
                  </button>
                )}
              </div>
            </td>
          </tr>
        </tfoot>
      )}
    </>
  );
}

export function GrelhaProgressiva({
  children,
  passo = 10,
  labelItem,
  className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
}: {
  children: ReactNode;
  passo?: number;
  labelItem?: string;
  className?: string;
}) {
  const itens = Children.toArray(children);
  const [visiveis, setVisiveis] = useState(passo);

  const total = itens.length;
  const mostrados = Math.min(visiveis, total);
  const restam = total - mostrados;

  return (
    <div className="space-y-4">
      <div className={className}>{itens.slice(0, mostrados)}</div>
      {total > passo && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 print:hidden">
          {restam > 0 && (
            <button
              type="button"
              onClick={() => setVisiveis((v) => Math.min(total, v + passo))}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white px-4 text-xs font-semibold text-[#1C1D21] shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#FBD34D] hover:bg-[#FBD34D] hover:shadow-xs active:scale-[0.98]"
            >
              <ChevronDown className="size-3.5" aria-hidden />
              Ver mais {Math.min(passo, restam)} {labelItem ? `${labelItem} ` : ""}({mostrados} de {total})
            </button>
          )}
          {mostrados > passo && (
            <button
              type="button"
              onClick={() => setVisiveis(passo)}
              className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-medium text-zinc-500 transition-all duration-200 hover:bg-zinc-100 hover:text-[#1C1D21] active:scale-[0.98]"
            >
              <ChevronUp className="size-3.5" aria-hidden />
              Recolher
            </button>
          )}
        </div>
      )}
    </div>
  );
}
