import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, ChevronsLeft, ChevronsRight, FilePlus2, FileText, FolderKanban, LayoutDashboard, ListChecks, Search, Settings } from "lucide-react";
import { useApp } from "@/app/contexto";
import { ROTULO_PERFIL } from "@/domain/rules/permissoes";
import { useConsulta } from "@/hooks/useConsulta";
import { api, fonteDados } from "@/services";
import { cn } from "@/components/ui/cn";
import { PrioridadeBadge } from "@/components/ui/status";
import { formatarData } from "@/domain/datas";

const MENU = [
  { para: "/", rotulo: "Dashboard", icone: LayoutDashboard, fim: true },
  { para: "/contratos", rotulo: "Central de Contratos", icone: FolderKanban },
  { para: "/processos/novo", rotulo: "Novo Processo", icone: FilePlus2 },
  { para: "/acoes", rotulo: "Ações Necessárias", icone: ListChecks, contador: true },
  { para: "/documentos", rotulo: "Documentos", icone: FileText },
  { para: "/admin", rotulo: "Administração", icone: Settings, permissao: "administrar" as const },
];

const CHAVE_MENU = "akross-contratos:menu-recolhido";

function lerMenu(): boolean {
  try {
    return localStorage.getItem(CHAVE_MENU) === "1";
  } catch {
    return false;
  }
}

export function Layout() {
  const { usuario, cad, trocarUsuario, pode, nomeUsuario } = useApp();
  const [recolhido, setRecolhido] = useState(lerMenu);
  const [busca, setBusca] = useState("");
  const [sinoAberto, setSinoAberto] = useState(false);
  const navegar = useNavigate();
  const { dados: acoes } = useConsulta(() => api.listarAcoes(), []);
  const minhas = (acoes ?? []).filter((a) => a.responsavelId === usuario.id || usuario.perfil === "Administrador");
  const urgentes = minhas.filter((a) => a.prioridade === "Crítico" || a.prioridade === "Ação necessária");

  const alternar = () => {
    setRecolhido((r) => {
      try {
        localStorage.setItem(CHAVE_MENU, r ? "0" : "1");
      } catch {
        /* preferência local */
      }
      return !r;
    });
  };

  return (
    <div className="flex h-full">
      <aside className={cn("flex shrink-0 flex-col bg-primaria-900 text-white transition-[width] duration-200", recolhido ? "w-16" : "w-60")}>
        <div className="flex h-14 items-center gap-2 border-b border-white/10 px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/15 text-sm font-bold">A</div>
          {!recolhido && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">Akross Atende</p>
              <p className="truncate text-[11px] text-white/60">Gestão de Contratos</p>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {MENU.filter((m) => !m.permissao || pode(m.permissao)).map((m) => (
            <NavLink
              key={m.para}
              to={m.para}
              end={m.fim}
              title={recolhido ? m.rotulo : undefined}
              className={({ isActive }) =>
                cn("flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors", isActive ? "bg-white/15 font-medium text-white" : "text-white/75 hover:bg-white/10 hover:text-white")
              }
            >
              <m.icone size={18} className="shrink-0" />
              {!recolhido && <span className="flex-1 truncate">{m.rotulo}</span>}
              {!recolhido && m.contador && urgentes.length > 0 && <span className="rounded-full bg-critico-600 px-1.5 text-[11px] font-semibold tabular">{urgentes.length}</span>}
            </NavLink>
          ))}
        </nav>
        <button onClick={alternar} className="flex h-10 items-center justify-center gap-2 border-t border-white/10 text-xs text-white/60 hover:text-white" aria-label={recolhido ? "Expandir menu" : "Recolher menu"}>
          {recolhido ? <ChevronsRight size={16} /> : (<><ChevronsLeft size={16} /> Recolher menu</>)}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-borda bg-superficie px-5">
          <form
            className="relative max-w-md flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              navegar(`/contratos?busca=${encodeURIComponent(busca)}`);
            }}
          >
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-texto-fraco" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código, fornecedor, CNPJ, objeto, JIRA ou projeto"
              className="h-9 w-full rounded-md border border-borda bg-fundo pr-3 pl-9 text-sm focus:border-primaria-500 focus:bg-superficie focus:outline-none"
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            {fonteDados === "mock" && <span className="hidden rounded bg-alerta-50 px-2 py-0.5 text-[11px] font-medium text-alerta-600 md:inline">Dados de demonstração</span>}
            <div className="relative">
              <button onClick={() => setSinoAberto((v) => !v)} className="relative rounded-md p-2 text-texto-suave hover:bg-fundo" aria-label="Alertas">
                <Bell size={18} />
                {urgentes.length > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-critico-600" />}
              </button>
              {sinoAberto && (
                <div className="absolute right-0 z-40 mt-2 w-96 rounded-[var(--radius-cartao)] border border-borda bg-superficie shadow-xl" onMouseLeave={() => setSinoAberto(false)}>
                  <div className="border-b border-borda px-4 py-2.5 text-sm font-semibold">Alertas no sistema</div>
                  <ul className="max-h-96 overflow-y-auto">
                    {minhas.slice(0, 8).map((a) => (
                      <li key={a.id}>
                        <button
                          onClick={() => {
                            setSinoAberto(false);
                            navegar(a.link);
                          }}
                          className="flex w-full flex-col gap-1 border-b border-borda px-4 py-2.5 text-left last:border-0 hover:bg-fundo"
                        >
                          <span className="flex items-center gap-2">
                            <PrioridadeBadge prioridade={a.prioridade} />
                            <span className="text-xs font-semibold text-primaria-800">{a.referencia.codigo}</span>
                          </span>
                          <span className="text-sm">{a.acao}</span>
                          <span className="text-xs text-texto-fraco">
                            Prazo {formatarData(a.prazo)} · {nomeUsuario(a.responsavelId)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {minhas.length === 0 && <li className="px-4 py-6 text-center text-sm text-texto-suave">Nenhum alerta para você.</li>}
                  </ul>
                  <button onClick={() => (setSinoAberto(false), navegar("/acoes"))} className="w-full border-t border-borda py-2 text-xs font-medium text-primaria-700 hover:bg-fundo">
                    Ver todas as ações
                  </button>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-texto-suave" title="Perfil simulado — no produto final virá do login da Akross Atende">
              <span className="hidden lg:inline">Perfil simulado</span>
              <select value={usuario.id} onChange={(e) => trocarUsuario(e.target.value)} className="h-9 rounded-md border border-borda bg-superficie px-2 text-sm text-texto">
                {cad.usuarios.filter((u) => u.ativo).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} — {u.diretor ? "Diretor" : ROTULO_PERFIL[u.perfil]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-5 py-5">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
