import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Lê um campo de texto de FormData (string vazia → null). */
export function campo(fd: FormData, nome: string): string | null {
  const v = fd.get(nome);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Normaliza número de WhatsApp para formato internacional (+244 por omissão). */
export function normalizarWhatsapp(numero: string): string | null {
  const digitos = numero.replace(/[^\d+]/g, "");
  if (digitos.startsWith("+")) {
    return /^\+\d{9,15}$/.test(digitos) ? digitos : null;
  }
  if (digitos.startsWith("00")) return normalizarWhatsapp("+" + digitos.slice(2));
  if (/^9\d{8}$/.test(digitos)) return "+244" + digitos; // telemóvel angolano
  if (/^244\d{9}$/.test(digitos)) return "+" + digitos;
  return null;
}

export type EstadoForm = { erro?: string; erros?: Record<string, string>; ok?: string; aviso?: string } | undefined;
