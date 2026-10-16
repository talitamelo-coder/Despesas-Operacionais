import { useState } from "react";
import { Download, FileUp } from "lucide-react";
import { useApp } from "@/app/contexto";
import { salvarArquivo } from "@/app/arquivos";
import { exportarCsv } from "@/app/exportar";
import { Badge, type Tom } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Tabela } from "@/components/ui/Tabela";
import { gerarCsv } from "@/domain/rules/csv";
import { MODELOS_CSV, type LinhaPrevia, type SituacaoLinhaCsv, type TipoImportacao } from "@/domain/rules/importacaoCsv";
import { api, type ResultadoImportacaoCsv } from "@/services";

const TOM: Record<SituacaoLinhaCsv, Tom> = { Importar: "sucesso", "Já existe": "neutro", Recusada: "critico", Conciliação: "alerta" };

/** Importação por CSV com modelo, pré-visualização linha a linha e relatório de recusadas. Reimportar não duplica. */
export function ImportacaoCsv({ tipos }: { tipos: TipoImportacao[] }) {
  const { usuario, executar } = useApp();
  const [tipo, setTipo] = useState<TipoImportacao>(tipos[0]);
  const [arquivo, setArquivo] = useState<{ nome: string; conteudo: string }>();
  const [previa, setPrevia] = useState<LinhaPrevia[]>();
  const [resultado, setResultado] = useState<ResultadoImportacaoCsv>();
  const modelo = MODELOS_CSV[tipo];

  const trocarTipo = (t: TipoImportacao) => (setTipo(t), setArquivo(undefined), setPrevia(undefined), setResultado(undefined));
  const carregar = async (f: File) => {
    const conteudo = await f.text();
    setResultado(undefined);
    setArquivo({ nome: f.name, conteudo });
    const p = await executar(() => api.previsualizarCsv(tipo, conteudo, usuario.id));
    setPrevia(p);
  };
  const importar = async () => {
    if (!arquivo) return;
    const r = await executar(() => api.importarCsv(tipo, arquivo.conteudo, usuario.id));
    if (r) (setResultado(r), setPrevia(r.linhas));
  };
  const conta = (s: SituacaoLinhaCsv) => previa?.filter((l) => l.situacao === s).length ?? 0;
  const problemas = previa?.filter((l) => l.situacao === "Recusada" || l.situacao === "Conciliação") ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader titulo="Importar por CSV" subtitulo="Baixe o modelo, preencha no Excel e envie. Nada é gravado antes da sua confirmação." />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {tipos.length > 1 && <Select rotulo="O que importar" vazio={false} value={tipo} onChange={(e) => trocarTipo(e.target.value as TipoImportacao)} opcoes={tipos.map((t) => ({ valor: t, rotulo: MODELOS_CSV[t].titulo }))} />}
            <div className="flex items-end gap-2">
              <Button variante="secundario" icone={<Download size={16} />} onClick={() => salvarArquivo(`modelo-${tipo}.csv`, gerarCsv(modelo.colunas, modelo.exemplo))}>Baixar modelo</Button>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primaria-800 px-4 text-sm font-medium text-white hover:bg-primaria-900">
                <FileUp size={16} /> Escolher arquivo
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => (e.target.files?.[0] && carregar(e.target.files[0]), (e.target.value = ""))} />
              </label>
            </div>
          </div>
          <p className="text-sm text-texto-suave">{modelo.ajuda}</p>
          {tipos.includes("atribuicoes") && <p className="text-xs text-texto-fraco">Ordem recomendada: 1) licenças, 2) movimentações (compras seguintes), 3) atribuições. Totais nunca vêm do arquivo: linhas de total são ignoradas.</p>}
        </CardBody>
      </Card>

      {previa && (
        <Card>
          <CardHeader
            titulo={resultado ? "Resultado da importação" : `Pré-visualização · ${arquivo?.nome}`}
            subtitulo={
              <span className="flex flex-wrap gap-2">
                <Badge tom="sucesso">{conta("Importar")} {resultado ? "importada(s)" : "a importar"}</Badge>
                <Badge>{conta("Já existe")} já existia(m)</Badge>
                <Badge tom="critico">{conta("Recusada")} recusada(s)</Badge>
                <Badge tom="alerta">{conta("Conciliação")} para conciliação</Badge>
              </span>
            }
            acoes={
              <div className="flex gap-2">
                {problemas.length > 0 && (
                  <Button variante="secundario" tamanho="sm" icone={<Download size={14} />} onClick={() => exportarCsv(`recusadas-${tipo}.csv`, ["linha", "situacao", "motivo", ...modelo.colunas], problemas.map((l) => [l.linha, l.situacao, l.motivo, ...modelo.colunas.map((c) => l.dados[c])]), usuario.id)}>
                    Relatório de recusadas
                  </Button>
                )}
                {!resultado && <Button tamanho="sm" disabled={!conta("Importar")} onClick={importar}>Importar {conta("Importar")} linha(s)</Button>}
              </div>
            }
          />
          {resultado && <CardBody><Aviso tom="sucesso">Importação concluída e registrada na auditoria. Reenviar o mesmo arquivo não duplica nada.</Aviso></CardBody>}
          <div className="max-h-[28rem] overflow-auto">
            <Tabela
              densa
              linhas={previa}
              chave={(l) => String(l.linha)}
              colunas={[
                { id: "linha", titulo: "Linha", alinhamento: "direita", render: (l) => l.linha },
                { id: "sit", titulo: "Situação", render: (l) => <Badge tom={TOM[l.situacao]}>{l.situacao}</Badge> },
                { id: "res", titulo: "Registro", render: (l) => l.resumo },
                { id: "mot", titulo: "Observação", render: (l) => <span className="text-xs text-texto-suave">{l.motivo ?? ""}</span> },
              ]}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
