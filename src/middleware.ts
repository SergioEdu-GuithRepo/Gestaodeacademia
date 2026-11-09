import { NextResponse, type NextRequest } from "next/server";

/**
 * Proteção leve: sem cookie de sessão → login. A validação real da sessão e
 * das permissões é feita no servidor (`exigir()` em cada página/action).
 */
const PUBLICAS = ["/login", "/plataforma", "/portal"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.has("sessao")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Exclui ficheiros estáticos, as landing pages públicas (/p/…), os portais (/portal/…),
  // o cron da Vercel (/api/cron/…) e os webhooks (autenticados pelo token secreto no URL).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login-editorial\\.jpg|p/|portal/|api/health|api/cron/|api/webhooks/).*)",
  ],
};
