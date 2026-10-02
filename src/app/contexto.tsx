import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { pode, type Permissao } from "@/domain/rules/permissoes";
import type { Configuracao, Empresa, Fornecedor, TipoContrato, Usuario } from "@/domain/types";
import { aoMudar, api } from "@/services";

/**
 * Contexto da sessão: usuário atual (simulado no MVP — virá do SSO da Akross Atende),
 * cadastros de apoio em cache e notificações (toasts).
 */

interface Cadastros {
  usuarios: Usuario[];
  empresas: Empresa[];
  fornecedores: Fornecedor[];
  tipos: TipoContrato[];
  config: Configuracao;
}

interface Toast {
  id: number;
  tom: "sucesso" | "erro" | "info";
  texto: string;
}

interface Contexto {
  usuario: Usuario;
  trocarUsuario: (id: string) => void;
  pode: (p: Permissao) => boolean;
  cad: Cadastros;
  nomeUsuario: (id?: string) => string;
  nomeEmpresa: (id?: string) => string;
  fornecedor: (id?: string) => Fornecedor | undefined;
  nomeTipo: (id?: string) => string;
  notificar: (texto: string, tom?: Toast["tom"]) => void;
  executar: <T>(acao: () => Promise<T>, sucesso?: string) => Promise<T | undefined>;
}

const Ctx = createContext<Contexto | null>(null);
const CHAVE_USUARIO = "akross-contratos:usuario";

function lerUsuarioSalvo(): string {
  try {
    return localStorage.getItem(CHAVE_USUARIO) ?? "u-sup1";
  } catch {
    return "u-sup1";
  }
}

export function ProvedorApp({ children }: { children: ReactNode }) {
  const [cad, setCad] = useState<Cadastros>();
  const [usuarioId, setUsuarioId] = useState(lerUsuarioSalvo);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const carregar = () =>
      Promise.all([api.listarUsuarios(), api.listarEmpresas(), api.listarFornecedores(), api.listarTiposContrato(), api.obterConfiguracao()]).then(
        ([usuarios, empresas, fornecedores, tipos, config]) => setCad({ usuarios, empresas, fornecedores, tipos, config }),
      );
    carregar();
    return aoMudar(carregar);
  }, []);

  const notificar = useCallback((texto: string, tom: Toast["tom"] = "sucesso") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tom, texto }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const valor = useMemo<Contexto | null>(() => {
    if (!cad) return null;
    const usuario = cad.usuarios.find((u) => u.id === usuarioId) ?? cad.usuarios[0];
    const mapa = <T,>(l: T[], k: (x: T) => string) => new Map(l.map((x) => [k(x), x]));
    const us = mapa(cad.usuarios, (u) => u.id);
    const es = mapa(cad.empresas, (e) => e.id);
    const fs = mapa(cad.fornecedores, (f) => f.fornecedor_id);
    const ts = mapa(cad.tipos, (t) => t.id);
    return {
      usuario,
      trocarUsuario: (id) => {
        setUsuarioId(id);
        try {
          localStorage.setItem(CHAVE_USUARIO, id);
        } catch {
          /* preferência apenas local */
        }
      },
      pode: (p) => pode(usuario.perfil, p),
      cad,
      nomeUsuario: (id) => (id && us.get(id)?.nome) || "—",
      nomeEmpresa: (id) => (id && es.get(id)?.nome) || "—",
      fornecedor: (id) => (id ? fs.get(id) : undefined),
      nomeTipo: (id) => (id && ts.get(id)?.nome) || "—",
      notificar,
      executar: async (acao, sucesso) => {
        try {
          const r = await acao();
          if (sucesso) notificar(sucesso);
          return r;
        } catch (e) {
          notificar((e as Error).message, "erro");
          return undefined;
        }
      },
    };
  }, [cad, usuarioId, notificar]);

  if (!valor) return <div className="flex h-full items-center justify-center text-sm text-texto-suave">Carregando módulo de contratos…</div>;

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`rounded-md border px-3 py-2.5 text-sm shadow-lg ${t.tom === "erro" ? "border-critico-50 bg-critico-50 text-critico-600" : t.tom === "info" ? "border-info-50 bg-info-50 text-info-600" : "border-sucesso-50 bg-sucesso-50 text-sucesso-600"}`}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useApp(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp fora do ProvedorApp");
  return c;
}

/** Opções de select a partir dos cadastros. */
export function useOpcoes() {
  const { cad } = useApp();
  return useMemo(
    () => ({
      empresas: cad.empresas.filter((e) => e.ativo).map((e) => ({ valor: e.id, rotulo: e.nome })),
      fornecedores: cad.fornecedores.map((f) => ({ valor: f.fornecedor_id, rotulo: f.statusCadastral === "Potencial" ? `${f.razaoSocial} (potencial)` : f.razaoSocial })),
      gestores: cad.usuarios.filter((u) => u.perfil === "Gestor" && !u.diretor && u.ativo).map((u) => ({ valor: u.id, rotulo: u.nome })),
      diretores: cad.usuarios.filter((u) => u.diretor && u.ativo).map((u) => ({ valor: u.id, rotulo: u.nome })),
      analistas: cad.usuarios.filter((u) => (u.perfil === "Suprimentos" || u.perfil === "Administrador") && u.ativo).map((u) => ({ valor: u.id, rotulo: u.nome })),
      tipos: cad.tipos.filter((t) => t.ativo).map((t) => ({ valor: t.id, rotulo: t.nome })),
      moedas: cad.config.moedas.map((m) => ({ valor: m, rotulo: m })),
      periodicidades: cad.config.periodicidades.map((m) => ({ valor: m, rotulo: m })),
      fontesCotacao: cad.config.fontesCotacao.map((m) => ({ valor: m, rotulo: m })),
      indices: cad.config.indicesReajuste.map((m) => ({ valor: m, rotulo: m })),
      origensSaving: cad.config.origensSaving.map((m) => ({ valor: m, rotulo: m })),
      origensOportunidade: cad.config.origensOportunidade.map((m) => ({ valor: m, rotulo: m })),
      projetos: (cad.config.listasAuxiliares["Projetos"] ?? []).map((m) => ({ valor: m, rotulo: m })),
    }),
    [cad],
  );
}
