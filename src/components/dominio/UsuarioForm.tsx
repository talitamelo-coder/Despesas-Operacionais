import { ordenarAlfabetica } from "@/domain/formatacao";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Input, Rotulo, Select, Toggle } from "@/components/ui/Campos";
import { cn } from "@/components/ui/cn";
import { ROTULO_PERFIL, comPerfis, perfisDo } from "@/domain/rules/permissoes";
import { AREAS_PADRAO, SENHA_MINIMA, nomeCurto } from "@/domain/rules/usuario";
import type { Perfil, Usuario } from "@/domain/types";

export const PERFIS: Perfil[] = ["Solicitante", "Gestor", "Suprimentos", "Juridico", "Leitura", "Administrador"];

const DESCRICAO_PERFIL: Record<Perfil, string> = {
  Solicitante: "Acompanha contratos e processos",
  Gestor: "Gestor de contratos: avalia renovação e acompanha seus contratos",
  Suprimentos: "Registra contratos, processos e aditivos",
  Juridico: "Emite parecer jurídico",
  Leitura: "Consulta contratos, sem alterar",
  Administrador: "Acesso total, usuários e cópia de segurança",
};

/** Cadastro de usuário: nome, e-mail, senha, perfil, área e filiais com acesso. */
export function UsuarioForm({
  u,
  onChange,
  senha,
  onSenha,
  erros,
}: {
  u: Usuario;
  onChange: (u: Usuario) => void;
  senha: string;
  onSenha: (s: string) => void;
  erros: Record<string, string>;
}) {
  const { cad } = useApp();
  const [verSenha, setVerSenha] = useState(false);
  const set = (p: Partial<Usuario>) => onChange({ ...u, ...p });
  const areas = ordenarAlfabetica(cad.config.listasAuxiliares["Áreas"]?.length ? cad.config.listasAuxiliares["Áreas"] : AREAS_PADRAO);
  const filiais = u.empresasIds ?? [];
  const alternarFilial = (id: string) => set({ empresasIds: filiais.includes(id) ? filiais.filter((x) => x !== id) : [...filiais, id] });
  const novo = !u.id;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Input rotulo="Nome completo" obrigatorio ajuda="Sai nos relatórios e nas extrações da base." placeholder="Ex.: Maria Clara de Souza Lima" value={u.nome} onChange={(e) => set({ nome: e.target.value })} erro={erros.nome} />
      <Input
        rotulo="Nome e sobrenome"
        ajuda={u.nomeExibicao?.trim() ? "Mostrado nas telas do sistema." : `Mostrado nas telas. Em branco, o sistema usa: ${nomeCurto(u.nome) || "—"}`}
        placeholder={nomeCurto(u.nome) || "Ex.: Maria Lima"}
        value={u.nomeExibicao ?? ""}
        onChange={(e) => set({ nomeExibicao: e.target.value || undefined })}
        erro={erros.nomeExibicao}
      />
      <Input rotulo="E-mail" obrigatorio type="email" autoComplete="off" placeholder="usuario@empresa.com.br" value={u.email} onChange={(e) => set({ email: e.target.value })} erro={erros.email} />
      <div className="relative">
        <Input
          rotulo="Senha"
          obrigatorio={novo}
          type={verSenha ? "text" : "password"}
          autoComplete="new-password"
          placeholder={novo ? `Mínimo ${SENHA_MINIMA} caracteres` : u.temSenha ? "Deixe em branco para manter a atual" : `Mínimo ${SENHA_MINIMA} caracteres`}
          value={senha}
          onChange={(e) => onSenha(e.target.value)}
          erro={erros.senha}
        />
        <button type="button" onClick={() => setVerSenha((v) => !v)} className="absolute top-[26px] right-2 rounded p-1.5 text-texto-fraco hover:text-texto" aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}>
          {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <Select rotulo="Área" obrigatorio vazio="— Selecione a área —" value={u.area ?? ""} onChange={(e) => set({ area: e.target.value || undefined })} opcoes={areas.map((a) => ({ valor: a, rotulo: a }))} erro={erros.area} />
      <fieldset className="md:col-span-2">
        <Rotulo rotulo="Perfis de acesso" obrigatorio />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PERFIS.map((p) => {
            const marcados = perfisDo(u);
            const ativo = marcados.includes(p);
            const ultimo = ativo && marcados.length === 1;
            return (
              <label key={p} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", ativo ? "border-primaria-500 bg-primaria-50" : "border-borda-forte bg-superficie", ultimo ? "cursor-not-allowed" : "cursor-pointer hover:bg-fundo")}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={ativo}
                  disabled={ultimo}
                  onChange={() => set(comPerfis(ativo ? marcados.filter((x) => x !== p) : [...marcados, p]))}
                />
                <span>
                  <span className="font-medium">{ROTULO_PERFIL[p]}</span>
                  <span className="block text-xs text-texto-suave">{DESCRICAO_PERFIL[p]}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-texto-fraco">Marque todos os perfis da pessoa: as permissões se somam.</p>
      </fieldset>
      <div className="md:col-span-2">
        <Rotulo rotulo="Filiais com acesso" />
        {cad.empresas.length === 0 ? (
          <p className="text-xs text-texto-suave">Cadastre as empresas em Administração → Empresas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cad.empresas.map((e) => {
              const ativa = filiais.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => alternarFilial(e.id)}
                  className={cn("rounded-full border px-3 py-1 text-xs transition-colors", ativa ? "border-primaria-500 bg-primaria-50 font-medium text-primaria-800" : "border-borda-forte bg-superficie text-texto-suave hover:bg-fundo")}
                >
                  {e.nome}
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-1.5 text-xs text-texto-fraco">{filiais.length === 0 ? "Nenhuma selecionada: acesso a todas as filiais." : `${filiais.length} filial(is) selecionada(s).`}</p>
      </div>
      <div className="flex flex-wrap gap-6 md:col-span-2">
        <Toggle rotulo="Diretor" ajuda="Dá ciência nas aprovações (aprova em exceção)" checked={Boolean(u.diretor)} onChange={(v) => set({ diretor: v })} />
        <Toggle rotulo="Ativo" checked={u.ativo} onChange={(v) => set({ ativo: v })} />
      </div>
    </div>
  );
}
