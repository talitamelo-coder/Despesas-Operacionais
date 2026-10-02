import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Variante = "primario" | "secundario" | "fantasma" | "perigo";
type Tamanho = "sm" | "md";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-primaria-800 text-white hover:bg-primaria-700 disabled:bg-primaria-200",
  secundario: "bg-superficie text-texto border border-borda-forte hover:bg-fundo disabled:text-texto-fraco",
  fantasma: "text-primaria-700 hover:bg-primaria-50 disabled:text-texto-fraco",
  perigo: "bg-critico-600 text-white hover:opacity-90 disabled:opacity-50",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  icone?: ReactNode;
}

export function Button({ variante = "primario", tamanho = "md", icone, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primaria-500",
        VARIANTES[variante],
        TAMANHOS[tamanho],
        className,
      )}
      {...rest}
    >
      {icone}
      {children}
    </button>
  );
}
