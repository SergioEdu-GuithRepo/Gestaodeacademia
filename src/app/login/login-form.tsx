"use client";

import { useFormAcao } from "@/components/form-acao";
import { Alerta, Button, Field, Input } from "@/components/ui";
import { entrar } from "./actions";

export function LoginForm() {
  const { estado, pendente, onSubmit } = useFormAcao(entrar);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {estado?.erro && <Alerta>{estado.erro}</Alerta>}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="text"
          inputMode="email"
          autoComplete="username"
          placeholder="admin@demo.ao"
          required
          autoFocus
        />
      </Field>
      <Field label="Palavra-passe" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? "A entrar…" : "Entrar na conta"}
      </Button>
    </form>
  );
}
