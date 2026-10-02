import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface Migalha {
  rotulo: string;
  para?: string;
}

export function PageHeader({ titulo, descricao, migalhas, acoes, extra }: { titulo: ReactNode; descricao?: ReactNode; migalhas?: Migalha[]; acoes?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-5">
      {migalhas && (
        <nav className="mb-2 flex items-center gap-1 text-xs text-texto-suave" aria-label="Navegação estrutural">
          {migalhas.map((m, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} />}
              {m.para ? (
                <Link to={m.para} className="hover:text-primaria-700">
                  {m.rotulo}
                </Link>
              ) : (
                <span className="text-texto">{m.rotulo}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-texto">{titulo}</h1>
          {descricao && <p className="mt-1 text-sm text-texto-suave">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {extra}
    </div>
  );
}
