import { temPerfil } from "@/domain/rules/permissoes";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useApp } from "@/app/contexto";
import { ROTULO_PERFIL } from "@/domain/rules/permissoes";
import { useConsulta } from "@/hooks/useConsulta";
import { api, fonteDados } from "@/services";
import { cn } from "@/components/ui/cn";
import { PrioridadeBadge } from "@/components/ui/status";
import { formatarData } from "@/domain/datas";
import { nomeDeExibicao } from "@/domain/rules/usuario";

const MENU: { para: string; rotulo: string; fim?: boolean; contador?: boolean; permissao?: "administrar" }[] = [
  { para: "/", rotulo: "Dashboard", fim: true },
  { para: "/contratos", rotulo: "Contratos de fornecedores" },
  { para: "/clientes", rotulo: "Contratos de clientes" },
  { para: "/processos/novo", rotulo: "Novo processo" },
  { para: "/acoes", rotulo: "Ações necessárias", contador: true },
  { para: "/documentos", rotulo: "Documentos" },
  { para: "/admin", rotulo: "Administração", permissao: "administrar" },
];

export function Layout() {
  const { usuario, cad, trocarUsuario, pode, nomeUsuario } = useApp();
  const [sinoAberto, setSinoAberto] = useState(false);
  const navegar = useNavigate();
  const { dados: acoes } = useConsulta(() => api.listarAcoes(), []);
  const minhas = (acoes ?? []).filter((a) => a.responsavelId === usuario.id || temPerfil(usuario, "Administrador"));
  const urgentes = minhas.filter((a) => a.prioridade === "Crítico" || a.prioridade === "Ação necessária");

  const itens = MENU.filter((m) => !m.permissao || pode(m.permissao) || (m.para === "/admin" && cad.modo === "demonstracao"));

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 bg-primaria-900 px-4 text-white md:px-5">
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-white/15 text-xs font-bold">A</div>
            <p className="hidden text-sm leading-tight font-semibold whitespace-nowrap sm:block">
              Akross <span className="font-normal text-white/60">· Gestão de Contratos</span>
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
            {fonteDados === "mock" &&
              (cad.modo === "demonstracao" ? (
                <span className="hidden rounded bg-alerta-50 px-2 py-0.5 text-[11px] font-medium text-alerta-600 md:inline">Dados de demonstração</span>
              ) : (
                <span title="Os dados ficam guardados só neste navegador. Faça cópias de segurança em Administração → Dados e backup." className="hidden rounded bg-info-50 px-2 py-0.5 text-[11px] font-medium text-info-600 md:inline">
                  Dados reais · salvos neste navegador
                </span>
              ))}
            <div className="relative">
              <button onClick={() => setSinoAberto((v) => !v)} className="relative rounded p-1.5 text-white/80 hover:bg-white/10" aria-label="Alertas">
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
            <label className="flex items-center gap-2 text-xs text-white/60" title="Perfil simulado — no produto final virá do login da Akross Atende">
              <span className="hidden lg:inline">Perfil simulado</span>
              <select value={usuario.id} onChange={(e) => trocarUsuario(e.target.value)} className="h-8 max-w-[11rem] rounded border border-white/20 bg-white/10 px-2 text-sm text-white sm:max-w-none [&>option]:text-texto">
                {cad.usuarios.filter((u) => u.ativo).map((u) => (
                  <option key={u.id} value={u.id}>
                    {nomeDeExibicao(u)} — {u.diretor ? "Diretor" : ROTULO_PERFIL[u.perfil]}{u.perfisAdicionais?.length ? ` + ${u.perfisAdicionais.map((p) => ROTULO_PERFIL[p]).join(", ")}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        {/* Menu em faixa única, como o cabeçalho de uma planilha: compacto e sem quebra de linha. */}
        <nav aria-label="Menu principal" className="flex shrink-0 overflow-x-auto border-b border-borda-forte bg-fundo">
          {itens.map((m) => (
            <NavLink
              key={m.para}
              to={m.para}
              end={m.fim}
              className={({ isActive }) =>
                cn(
                  "-mb-px flex h-8 shrink-0 items-center gap-1.5 border-r border-b-2 border-r-borda px-4 text-[13px] whitespace-nowrap transition-colors",
                  isActive ? "border-b-primaria-700 bg-superficie font-semibold text-primaria-800" : "border-b-transparent text-texto-suave hover:bg-superficie hover:text-texto",
                )
              }
            >
              {m.rotulo}
              {m.contador && urgentes.length > 0 && <span className="rounded-full bg-critico-600 px-1.5 text-[10px] leading-4 font-semibold text-white tabular">{urgentes.length}</span>}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-5 py-5">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
