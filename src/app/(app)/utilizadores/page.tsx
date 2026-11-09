import Link from "next/link";
import { Settings } from "lucide-react";
import { exigir } from "@/lib/auth";
import { GestaoUtilizadores } from "./gestao-utilizadores";

export const metadata = { title: "Equipa" };

export default async function UtilizadoresPage() {
  const { user } = await exigir("utilizadores:gerir");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Equipa e Acessos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Gestão de utilizadores, perfis de permissão e segurança de <strong>{user.tenant.nome}</strong>
          </p>
        </div>
        <Link
          href="/configuracoes"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-semibold text-zinc-800 shadow-2xs transition-colors hover:bg-zinc-50"
        >
          <Settings className="size-3.5 text-zinc-500" aria-hidden /> Configurações do Centro
        </Link>
      </div>

      <GestaoUtilizadores meuId={user.id} />
    </div>
  );
}
