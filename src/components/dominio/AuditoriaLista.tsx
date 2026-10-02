import { useApp } from "@/app/contexto";
import { Tabela } from "@/components/ui/Tabela";
import { formatarDataHora } from "@/domain/datas";
import type { RegistroAuditoria } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

function curto(v?: string) {
  if (v === undefined || v === "") return <span className="text-texto-fraco">—</span>;
  return <span title={v} className="line-clamp-2 break-all">{v.length > 80 ? `${v.slice(0, 80)}…` : v}</span>;
}

/** Trilha de auditoria: usuário, data, ação, campo, valor anterior e novo. Nunca é apagada. */
export function AuditoriaLista({ entidadeIds }: { entidadeIds?: string[] }) {
  const { nomeUsuario } = useApp();
  const chave = entidadeIds?.join(",");
  const { dados } = useConsulta(async () => {
    if (!entidadeIds) return api.listarAuditoria();
    const listas = await Promise.all(entidadeIds.map((id) => api.listarAuditoria(id)));
    return listas.flat().sort((a, b) => b.data.localeCompare(a.data));
  }, [chave]);
  return (
    <Tabela<RegistroAuditoria>
      densa
      linhas={dados ?? []}
      chave={(r) => r.id}
      vazio="Sem registros de auditoria."
      colunas={[
        { id: "data", titulo: "Data", largura: "140px", render: (r) => <span className="tabular">{formatarDataHora(r.data)}</span> },
        { id: "usuario", titulo: "Usuário", render: (r) => nomeUsuario(r.usuarioId) },
        { id: "acao", titulo: "Ação", render: (r) => r.acao },
        { id: "campo", titulo: "Campo", render: (r) => <code className="text-xs">{r.campo ?? "—"}</code> },
        { id: "antes", titulo: "Valor anterior", render: (r) => curto(r.valorAnterior) },
        { id: "depois", titulo: "Valor novo", render: (r) => curto(r.valorNovo) },
      ]}
    />
  );
}
