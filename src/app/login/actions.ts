"use server";

import { redirect } from "next/navigation";
import { criarSessao, terminarSessao, verificarCredenciais } from "@/lib/auth";
import { iniciarSessaoSuperAdmin, verificarChaveSuperAdmin } from "@/lib/superadmin";
import type { EstadoForm } from "@/lib/utils";

export async function entrar(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { erro: "Indique o email e a palavra-passe." };

  if (
    email === "superadmin" ||
    email.startsWith("superadmin@") ||
    email === "plataforma" ||
    email.startsWith("plataforma@")
  ) {
    if (verificarChaveSuperAdmin(password)) {
      await iniciarSessaoSuperAdmin();
      redirect("/plataforma");
    }
    return { erro: "Email ou palavra-passe incorretos." };
  }

  const user = await verificarCredenciais(email, password);
  if (!user) return { erro: "Email ou palavra-passe incorretos." };

  await criarSessao(user.id);
  redirect("/painel");
}

export async function sair() {
  await terminarSessao();
  redirect("/login");
}
