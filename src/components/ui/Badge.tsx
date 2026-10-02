import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tom = "neutro" | "info" | "sucesso" | "alerta" | "acao" | "critico" | "primario";

const TONS: Record<Tom, string> = {
  neutro: "bg-fundo text-texto-suave border-borda",
  info: "bg-info-50 text-info-600 border-info-50",
  sucesso: "bg-sucesso-50 text-sucesso-600 border-sucesso-50",
  alerta: "bg-alerta-50 text-alerta-600 border-alerta-50",
  acao: "bg-acao-50 text-acao-600 border-acao-50",
  critico: "bg-critico-50 text-critico-600 border-critico-50",
  primario: "bg-primaria-50 text-primaria-700 border-primaria-100",
};

export function Badge({ tom = "neutro", children, className, icone }: { tom?: Tom; children: ReactNode; className?: string; icone?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONS[tom], className)}>
      {icone}
      {children}
    </span>
  );
}
