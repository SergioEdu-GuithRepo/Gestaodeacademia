"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import type { EstadoForm } from "@/lib/utils";

/**
 * useActionState sem o reset automático do React 19 após submissão: em caso de
 * erro de validação os valores introduzidos mantêm-se no formulário.
 * Com `limparAoGuardar`, o formulário é limpo quando a action devolve `ok`.
 */
export function useFormAcao<S extends EstadoForm = EstadoForm>(
  acao: (prev: S, fd: FormData) => Promise<S>,
  opcoes?: { limparAoGuardar?: boolean },
) {
  const [estado, dispatch, pendente] = useActionState<S, FormData>(
    acao as (prev: Awaited<S>, fd: FormData) => Promise<S>,
    undefined as Awaited<S>,
  );
  const ref = useRef<HTMLFormElement>(null);
  const limpar = opcoes?.limparAoGuardar ?? false;

  useEffect(() => {
    if (limpar && estado?.ok) ref.current?.reset();
  }, [estado, limpar]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return { estado, pendente, ref, onSubmit };
}
