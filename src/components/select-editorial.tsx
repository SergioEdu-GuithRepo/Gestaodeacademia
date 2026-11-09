"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  Children,
  type ChangeEvent,
  type ComponentProps,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type OpcaoItem = {
  valor: string;
  rotulo: string;
  desativado?: boolean;
  grupo?: string;
};

function extrairTexto(nodo: ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(extrairTexto).join("");
  if (isValidElement<{ children?: ReactNode }>(nodo)) return extrairTexto(nodo.props.children);
  return "";
}

function extrairOpcoes(children: ReactNode, grupoAtual?: string): OpcaoItem[] {
  const lista: OpcaoItem[] = [];
  Children.forEach(children, (filho) => {
    if (!isValidElement<Record<string, unknown>>(filho)) return;
    const tipo = filho.type;
    if (tipo === "option") {
      const rotulo = extrairTexto(filho.props.children as ReactNode).trim();
      const valBruto = filho.props.value;
      const valor = valBruto !== undefined && valBruto !== null ? String(valBruto) : rotulo;
      lista.push({
        valor,
        rotulo,
        desativado: Boolean(filho.props.disabled),
        grupo: grupoAtual,
      });
    } else if (tipo === "optgroup") {
      const nomeGrupo = String(filho.props.label ?? "");
      lista.push(...extrairOpcoes(filho.props.children as ReactNode, nomeGrupo));
    } else if (filho.props && "children" in filho.props) {
      lista.push(...extrairOpcoes(filho.props.children as ReactNode, grupoAtual));
    }
  });
  return lista;
}

export function SelectEditorial({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  id,
  name,
  required,
  "aria-label": ariaLabel,
  ...rest
}: ComponentProps<"select">) {
  const autoId = useId();
  const selectId = id ?? `sel-${autoId}`;
  const opcoes = useMemo(() => extrairOpcoes(children), [children]);

  const controlado = value !== undefined;
  const valorInicial = useMemo(() => {
    if (value !== undefined && value !== null) return String(value);
    if (defaultValue !== undefined && defaultValue !== null) return String(defaultValue);
    return opcoes[0]?.valor ?? "";
  }, [value, defaultValue, opcoes]);

  const [valorInterno, setValorInterno] = useState<string>(valorInicial);
  const valorAtual = controlado ? String(value ?? "") : valorInterno;

  // Sincroniza quando defaultValue muda entre navegações de servidor
  useEffect(() => {
    if (!controlado && defaultValue !== undefined && defaultValue !== null) {
      setValorInterno(String(defaultValue));
    }
  }, [controlado, defaultValue]);

  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [indiceFoco, setIndiceFoco] = useState<number>(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; abrirAcima: boolean } | null>(null);

  const selectRef = useRef<HTMLSelectElement | null>(null);
  const botaoRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buscaRef = useRef<HTMLInputElement | null>(null);

  const opcaoSelecionada = useMemo(
    () => opcoes.find((o) => o.valor === valorAtual) ?? opcoes[0],
    [opcoes, valorAtual],
  );

  const opcoesFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return opcoes;
    return opcoes.filter(
      (o) => o.rotulo.toLowerCase().includes(q) || (o.grupo && o.grupo.toLowerCase().includes(q)),
    );
  }, [opcoes, busca]);

  // Suporte a form.reset()
  useEffect(() => {
    const form = selectRef.current?.form;
    if (!form || controlado) return;
    function aoResetar() {
      window.setTimeout(() => {
        if (selectRef.current) {
          setValorInterno(selectRef.current.value);
        }
      }, 0);
    }
    form.addEventListener("reset", aoResetar);
    return () => form.removeEventListener("reset", aoResetar);
  }, [controlado]);

  function atualizarPosicao() {
    const btn = botaoRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const espacoAbaixo = window.innerHeight - r.bottom;
    const alturaEstimada = Math.min(320, opcoes.length * 38 + (opcoes.length > 8 ? 52 : 16));
    const abrirAcima = espacoAbaixo < alturaEstimada && r.top > espacoAbaixo;
    const largura = Math.max(r.width, 210);
    const leftMax = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));

    setPos({
      top: abrirAcima ? r.top - 6 : r.bottom + 6,
      left: leftMax,
      width: largura,
      abrirAcima,
    });
  }

  function abrirMenu() {
    if (disabled) return;
    atualizarPosicao();
    setBusca("");
    const idx = opcoes.findIndex((o) => o.valor === valorAtual);
    setIndiceFoco(idx >= 0 ? idx : 0);
    setAberto(true);
  }

  function fecharMenu() {
    setAberto(false);
    setBusca("");
  }

  useEffect(() => {
    if (!aberto) return;
    if (opcoes.length > 8) {
      window.setTimeout(() => buscaRef.current?.focus(), 10);
    }
    function aoClicarFora(ev: MouseEvent) {
      const alvo = ev.target as Node | null;
      if (botaoRef.current?.contains(alvo) || menuRef.current?.contains(alvo)) return;
      fecharMenu();
    }
    function aoReposicionar() {
      atualizarPosicao();
    }
    window.addEventListener("mousedown", aoClicarFora);
    window.addEventListener("resize", aoReposicionar);
    window.addEventListener("scroll", aoReposicionar, true);
    return () => {
      window.removeEventListener("mousedown", aoClicarFora);
      window.removeEventListener("resize", aoReposicionar);
      window.removeEventListener("scroll", aoReposicionar, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, opcoes.length]);

  function selecionarValor(novoValor: string) {
    if (!controlado) {
      setValorInterno(novoValor);
    }
    const el = selectRef.current;
    if (el) {
      el.value = novoValor;
      if (onChange) {
        const eventoSintetico = {
          target: el,
          currentTarget: el,
          bubbles: true,
          cancelable: false,
          defaultPrevented: false,
          isDefaultPrevented: () => false,
          isPropagationStopped: () => false,
          persist: () => {},
          preventDefault: () => {},
          stopPropagation: () => {},
          nativeEvent: new Event("change"),
          timeStamp: Date.now(),
          type: "change",
        } as unknown as ChangeEvent<HTMLSelectElement>;
        onChange(eventoSintetico);
      }
    }
    fecharMenu();
    botaoRef.current?.focus();
  }

  function aoTeclar(ev: KeyboardEvent) {
    if (disabled) return;
    if (!aberto) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp" || ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        abrirMenu();
      }
      return;
    }

    if (ev.key === "Escape") {
      ev.preventDefault();
      fecharMenu();
      botaoRef.current?.focus();
      return;
    }

    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setIndiceFoco((i) => {
        let prox = i + 1;
        while (prox < opcoesFiltradas.length && opcoesFiltradas[prox]?.desativado) prox++;
        return prox < opcoesFiltradas.length ? prox : i;
      });
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setIndiceFoco((i) => {
        let ant = i - 1;
        while (ant >= 0 && opcoesFiltradas[ant]?.desativado) ant--;
        return ant >= 0 ? ant : i;
      });
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const op = opcoesFiltradas[indiceFoco];
      if (op && !op.desativado) selecionarValor(op.valor);
    }
  }

  const temLarguraAuto = Boolean(className && /\bw-auto\b/.test(className));
  const ehPlaceholder = Boolean(opcaoSelecionada?.desativado && opcaoSelecionada?.valor === "");

  return (
    <div className={cn("relative", temLarguraAuto ? "inline-block" : "block w-full")}>
      {/* Select nativo oculto para submissão de formulários (FormData), validação required e integração com labels */}
      <select
        ref={selectRef}
        id={selectId}
        name={name}
        required={required}
        disabled={disabled}
        value={valorAtual}
        onChange={(e) => {
          if (!controlado) setValorInterno(e.target.value);
          onChange?.(e);
        }}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none sr-only"
        {...rest}
      >
        {children}
      </select>

      {/* Gatilho editorial personalizado */}
      <button
        ref={botaoRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={ariaLabel}
        onClick={() => (aberto ? fecharMenu() : abrirMenu())}
        onKeyDown={aoTeclar}
        className={cn(
          "group flex min-h-10 cursor-pointer items-center justify-between gap-2.5 rounded-2xl border border-zinc-200/90 bg-white pr-2.5 pl-3.5 text-left text-base text-[#1C1D21] shadow-2xs transition-all duration-200 hover:border-zinc-300 focus:border-[#1C1D21] focus:ring-2 focus:ring-[#FBD34D]/60 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled: opacity-60 sm:text-sm",
          aberto && "border-[#1C1D21] ring-2 ring-[#FBD34D]/60",
          temLarguraAuto ? "w-auto" : "w-full",
          className,
        )}
      >
        <span className={cn("truncate", ehPlaceholder ? "text-zinc-400" : "font-medium text-[#1C1D21]")}>
          {opcaoSelecionada?.rotulo ?? "Selecionar…"}
        </span>
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
            aberto
              ? "bg-[#1C1D21] text-[#FBD34D]"
              : "bg-[#F5F4EF] text-zinc-600 group-hover:bg-[#FBD34D] group-hover:text-[#1C1D21]",
          )}
          aria-hidden="true"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform duration-200", aberto && "rotate-180")}
          />
        </span>
      </button>

      {/* Menu Popover Editorial (em portal para nunca cortar em tabelas ou cartões) */}
      {aberto &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              top: pos.abrirAcima ? undefined : pos.top,
              bottom: pos.abrirAcima ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width: pos.width,
            }}
            className="modal-painel fixed z-[95] overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-1.5 shadow-[0_18px_42px_-10px_rgba(28,29,33,0.22)] ring-1 ring-[#1C1D21]/5"
          >
            {opcoes.length > 8 && (
              <div className="mb-1.5 border-b border-dotted border-zinc-200 pb-1.5">
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-2.5 size-3.5 text-zinc-400" aria-hidden="true" />
                  <input
                    ref={buscaRef}
                    type="text"
                    value={busca}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      setIndiceFoco(0);
                    }}
                    onKeyDown={aoTeclar}
                    placeholder="Filtrar opções…"
                    className="h-8 w-full rounded-xl bg-[#FAF9F5] pr-3 pl-8 text-xs text-[#1C1D21] placeholder:text-zinc-400 focus:ring-1 focus:ring-[#1C1D21] focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="max-h-64 space-y-0.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]">
              {opcoesFiltradas.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-zinc-400">Nenhuma opção encontrada.</div>
              ) : (
                opcoesFiltradas.map((op, i) => {
                  const selecionado = op.valor === valorAtual;
                  const focado = i === indiceFoco;
                  const grupoAnterior = i > 0 ? opcoesFiltradas[i - 1]?.grupo : undefined;
                  const mostrarCabecalhoGrupo = Boolean(op.grupo && op.grupo !== grupoAnterior);

                  return (
                    <div key={`${op.grupo ?? ""}-${op.valor}-${i}`}>
                      {mostrarCabecalhoGrupo && (
                        <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                          {op.grupo}
                        </div>
                      )}
                      <button
                        type="button"
                        role="option"
                        aria-selected={selecionado}
                        disabled={op.desativado}
                        onMouseEnter={() => setIndiceFoco(i)}
                        onClick={() => {
                          if (!op.desativado) selecionarValor(op.valor);
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-colors duration-150 sm:text-sm",
                          op.desativado && "cursor-not-allowed opacity-45",
                          selecionado
                            ? "bg-[#1C1D21] font-semibold text-white shadow-2xs"
                            : focado
                              ? "bg-[#FAF9F5] font-medium text-[#1C1D21]"
                              : "text-zinc-700 hover:bg-[#FAF9F5] hover:text-[#1C1D21]",
                        )}
                      >
                        <span className="truncate">{op.rotulo}</span>
                        {selecionado && (
                          <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-[#FBD34D] text-[#1C1D21]">
                            <Check className="size-3 stroke-[2.75]" aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
