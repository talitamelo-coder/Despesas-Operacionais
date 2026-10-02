import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

export function Modal({ aberto, titulo, onFechar, children, rodape, largura = "md" }: { aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode; rodape?: ReactNode; largura?: "md" | "lg" | "xl" }) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onMouseDown={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn("w-full rounded-[var(--radius-cartao)] bg-superficie shadow-xl", { md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[largura])}
      >
        <header className="flex items-center justify-between border-b border-borda px-5 py-3">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button onClick={onFechar} className="rounded p-1 text-texto-suave hover:bg-fundo" aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <footer className="flex justify-end gap-2 border-t border-borda px-5 py-3">{rodape}</footer>}
      </div>
    </div>
  );
}
