import { useState } from "react";
import { FileText, Upload } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Campos";
import { Modal } from "@/components/ui/Modal";
import { Tabela } from "@/components/ui/Tabela";
import { Badge } from "@/components/ui/Badge";
import { formatarDataHora } from "@/domain/datas";
import type { CategoriaDocumento, Documento } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

export const CATEGORIAS_DOCUMENTO: CategoriaDocumento[] = ["Proposta", "Minuta", "Contrato", "Aditivo", "Parecer", "Contrato assinado", "Anexo"];

/**
 * Lista de documentos com versão. No MVP só os METADADOS são registrados (o arquivo não é
 * armazenado); o repositório definitivo (ex.: Adobe/ECM) será integrado via `external_id`.
 */
export function DocumentosLista({ contrato_id, processo_id, densa }: { contrato_id?: string; processo_id?: string; densa?: boolean }) {
  const { nomeUsuario, pode, usuario, executar } = useApp();
  const { dados } = useConsulta(() => api.listarDocumentos({ contrato_id, processo_id }), [contrato_id, processo_id]);
  const [aberto, setAberto] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaDocumento>("Anexo");
  const [arquivo, setArquivo] = useState<File>();

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs text-texto-suave">{dados?.length ?? 0} documento(s)</span>
        {pode("gerir_documentos") && (
          <Button variante="secundario" tamanho="sm" icone={<Upload size={14} />} onClick={() => setAberto(true)}>
            Anexar documento
          </Button>
        )}
      </div>
      <Tabela<Documento>
        densa={densa}
        linhas={dados ?? []}
        chave={(d) => d.id}
        vazio="Nenhum documento anexado."
        colunas={[
          { id: "nome", titulo: "Nome", render: (d) => <span className="flex items-center gap-2"><FileText size={14} className="shrink-0 text-texto-fraco" />{d.nome}</span> },
          { id: "cat", titulo: "Categoria", render: (d) => <Badge tom={d.categoria === "Contrato assinado" ? "sucesso" : "neutro"}>{d.categoria}</Badge> },
          { id: "versao", titulo: "Versão", alinhamento: "centro", render: (d) => <span className="tabular">v{d.versao}</span> },
          { id: "data", titulo: "Data", render: (d) => <span className="tabular">{formatarDataHora(d.data)}</span> },
          { id: "usuario", titulo: "Usuário", render: (d) => nomeUsuario(d.usuarioId) },
        ]}
      />
      <Modal
        aberto={aberto}
        titulo="Anexar documento"
        onFechar={() => setAberto(false)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button
              disabled={!arquivo}
              onClick={async () => {
                const ok = await executar(
                  () => api.adicionarDocumento({ contrato_id, processo_id, nome: arquivo!.name, categoria, tamanhoKb: Math.round(arquivo!.size / 1024) }, usuario.id),
                  "Documento anexado.",
                );
                if (ok) {
                  setAberto(false);
                  setArquivo(undefined);
                }
              }}
            >
              Anexar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select rotulo="Categoria" obrigatorio vazio={false} value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDocumento)} opcoes={CATEGORIAS_DOCUMENTO.map((c) => ({ valor: c, rotulo: c }))} />
          <div>
            <label className="mb-1 block text-xs font-medium text-texto-suave">Arquivo</label>
            <input type="file" onChange={(e) => setArquivo(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primaria-50 file:px-3 file:py-1.5 file:text-primaria-800" />
            <p className="mt-1 text-xs text-texto-fraco">Mesmo nome e categoria geram nova versão. Demonstração: apenas os metadados são registrados.</p>
          </div>
        </div>
      </Modal>
    </>
  );
}
