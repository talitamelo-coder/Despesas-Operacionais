import { useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Vazio } from "./Diversos";

export interface ItemBarra {
  chave: string;
  rotulo: string;
  /** Valor que define o comprimento e a ordem. */
  valor: number;
  /** Texto à direita da barra (ex.: "R$ 10 mil · US$ 2 mil · 12%"). */
  legenda: string;
  /** Barras-resumo ("Demais", "Disponível"…) ficam em tom neutro. */
  resumo?: boolean;
  detalhe?: ReactNode;
}

/**
 * Barras horizontais de UMA medida, do maior para o menor (um tom; identidade vem do rótulo).
 * Hover mostra o detalhe; clique abre o que o chamador quiser (ex.: licenças da barra).
 */
export function BarrasRanking({ itens, onClique, vazio = "Sem dados para o período" }: { itens: ItemBarra[]; onClique?: (i: ItemBarra) => void; vazio?: string }) {
  const [foco, setFoco] = useState<string>();
  if (!itens.length) return <Vazio titulo={vazio} />;
  const max = Math.max(...itens.map((i) => i.valor), 0) || 1;
  return (
    <ul className="space-y-1" role="list">
      {itens.map((i) => (
        <li key={i.chave}>
          <button
            type="button"
            onClick={() => onClique?.(i)}
            onMouseEnter={() => setFoco(i.chave)}
            onMouseLeave={() => setFoco(undefined)}
            onFocus={() => setFoco(i.chave)}
            onBlur={() => setFoco(undefined)}
            className={cn("group block w-full rounded-md px-1.5 py-1 text-left", onClique && "hover:bg-fundo")}
            aria-label={`${i.rotulo}: ${i.legenda}`}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className={cn("min-w-0 truncate text-xs", i.resumo ? "italic text-texto-suave" : "text-texto")} title={i.rotulo}>{i.rotulo}</span>
              <span className="shrink-0 text-[11px] text-texto-suave tabular">{i.legenda}</span>
            </span>
            <span className="mt-1 block h-2.5">
              <span className={cn("block h-full rounded-r-[4px]", i.resumo ? "bg-borda-forte" : "bg-primaria-600")} style={{ width: `max(2px, ${(Math.max(i.valor, 0) / max) * 100}%)` }} />
            </span>
          </button>
          {foco === i.chave && i.detalhe && <div className="mx-1.5 mb-1 rounded-md border border-borda bg-superficie px-3 py-2 text-xs shadow-sm">{i.detalhe}</div>}
        </li>
      ))}
    </ul>
  );
}
