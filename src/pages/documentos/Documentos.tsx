import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Search } from "lucide-react";
import { useApp } from "@/app/contexto";
import { CATEGORIAS_DOCUMENTO } from "@/components/dominio/DocumentosLista";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Campos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Paginacao, Tabela } from "@/components/ui/Tabela";
import { formatarDataHora } from "@/domain/datas";
import { normalizarBusca } from "@/domain/formatacao";
import type { Documento } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

/** Repositório de documentos de contratos e processos (metadados e versões). */
export function Documentos() {
  const { nomeUsuario } = useApp();
  const { dados: docs, carregando } = useConsulta(() => api.listarDocumentos(), []);
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);
  const { dados: processos } = useConsulta(() => api.listarProcessos(), []);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [pagina, setPagina] = useState(0);

  const codigo = useMemo(() => {
    const m = new Map<string, { codigo: string; link: string }>();
    for (const c of contratos ?? []) m.set(c.contrato_id, { codigo: c.codigo, link: `/contratos/${c.contrato_id}` });
    for (const p of processos ?? []) m.set(p.processo_id, { codigo: p.codigo, link: `/processos/${p.processo_id}` });
    return m;
  }, [contratos, processos]);

  const ref = (d: Documento) => (d.contrato_id && codigo.get(d.contrato_id)) || (d.processo_id && codigo.get(d.processo_id)) || undefined;
  const filtrados = (docs ?? []).filter((d) => (!categoria || d.categoria === categoria) && (!busca || normalizarBusca(`${d.nome} ${ref(d)?.codigo ?? ""}`).includes(normalizarBusca(busca))));
  const TAM = 50;

  return (
    <>
      <PageHeader titulo="Documentos" descricao="Propostas, minutas, contratos, aditivos, pareceres, contratos assinados e anexos de todos os contratos e processos." />
      <Card>
        <div className="grid grid-cols-1 gap-3 border-b border-borda p-4 md:grid-cols-[1fr_240px]">
          <div className="relative self-end">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-texto-fraco" />
            <input value={busca} onChange={(e) => (setBusca(e.target.value), setPagina(0))} placeholder="Buscar por nome do arquivo ou código" className="h-9 w-full rounded-md border border-borda-forte pr-3 pl-9 text-sm" />
          </div>
          <Select rotulo="Categoria" vazio="Todas" opcoes={CATEGORIAS_DOCUMENTO.map((c) => ({ valor: c, rotulo: c }))} value={categoria} onChange={(e) => (setCategoria(e.target.value), setPagina(0))} />
        </div>
        <Tabela<Documento>
          carregando={carregando && !docs}
          linhas={filtrados.slice(pagina * TAM, (pagina + 1) * TAM)}
          chave={(d) => d.id}
          colunas={[
            { id: "nome", titulo: "Nome", render: (d) => <span className="flex items-center gap-2"><FileText size={14} className="shrink-0 text-texto-fraco" />{d.nome}</span> },
            { id: "cat", titulo: "Categoria", render: (d) => <Badge tom={d.categoria === "Contrato assinado" ? "sucesso" : "neutro"}>{d.categoria}</Badge> },
            { id: "ref", titulo: "Contrato / processo", render: (d) => { const r = ref(d); return r ? <Link to={r.link} className="font-semibold text-primaria-800 hover:underline">{r.codigo}</Link> : "—"; } },
            { id: "v", titulo: "Versão", alinhamento: "centro", render: (d) => <span className="tabular">v{d.versao}</span> },
            { id: "data", titulo: "Data", render: (d) => <span className="tabular">{formatarDataHora(d.data)}</span> },
            { id: "u", titulo: "Usuário", render: (d) => nomeUsuario(d.usuarioId) },
          ]}
        />
        <Paginacao pagina={pagina} total={filtrados.length} tamanho={TAM} onPagina={setPagina} />
      </Card>
    </>
  );
}
