import { useMemo, useState } from "react";
import { useApp } from "@/app/contexto";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, InputNumero, Select } from "@/components/ui/Campos";
import { Tabela } from "@/components/ui/Tabela";
import { formatarData, hoje } from "@/domain/datas";
import { formatarMoeda, formatarNumero, formatarPercentual } from "@/domain/formatacao";
import { cotacaoNaData, parametroNaData, parcelasDoPeriodo } from "@/domain/rules/licencas";
import { PARAMETROS } from "@/domain/rules/parametros";
import type { ChaveParametro } from "@/domain/types";
import { api } from "@/services";
import type { ContextoLicencas } from "./Licencas";

/** Câmbio, parâmetros e orçamentos. Alterar aqui recalcula tudo sem deploy; o passado mantém os valores da época. */
export function Configuracao({ ctx }: { ctx: ContextoLicencas }) {
  return (
    <div className="space-y-4">
      <Parametros ctx={ctx} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Cotacoes ctx={ctx} />
        <Orcamentos ctx={ctx} />
      </div>
    </div>
  );
}

function Parametros({ ctx }: { ctx: ContextoLicencas }) {
  const { usuario, executar } = useApp();
  const [edit, setEdit] = useState<{ chave: ChaveParametro; valor: string; desde: string }>();
  const h = hoje();
  const chaves = Object.keys(PARAMETROS) as ChaveParametro[];
  return (
    <Card>
      <CardHeader titulo="Parâmetros de custo" subtitulo="Preenchidos pela controladoria. Cada valor vale a partir da data informada; meses anteriores não são recalculados." />
      <Tabela
        linhas={chaves}
        chave={(k) => k}
        colunas={[
          { id: "p", titulo: "Parâmetro", render: (k) => <span><span className="font-medium">{PARAMETROS[k].rotulo}</span><span className="block text-xs text-texto-suave">{PARAMETROS[k].descricao}</span></span> },
          { id: "v", titulo: "Valor atual", render: (k) => { const v = parametroNaData(ctx.dados.parametros, k, h); return v === undefined ? <Badge tom="alerta">Não configurado</Badge> : PARAMETROS[k].tipo === "percentual" ? `${v.replace(".", ",")}%` : PARAMETROS[k].tipo === "fator" ? `× ${v.replace(".", ",")}` : v === "nao" ? "Não" : v === "sim" ? "Sim" : v; } },
          { id: "d", titulo: "Vale desde", render: (k) => formatarData(ctx.dados.parametros.filter((p) => p.chave === k && p.vigenteDesde <= h).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0]?.vigenteDesde) },
          { id: "hist", titulo: "Histórico", alinhamento: "direita", render: (k) => ctx.dados.parametros.filter((p) => p.chave === k).length },
          { id: "a", titulo: "", alinhamento: "direita", render: (k) => <Button variante="fantasma" tamanho="sm" onClick={() => { const v = parametroNaData(ctx.dados.parametros, k, h) ?? (PARAMETROS[k].tipo === "simnao" ? "nao" : ""); setEdit({ chave: k, valor: PARAMETROS[k].tipo === "dominios" ? v : v.replace(".", ","), desde: h }); }}>Alterar</Button> },
        ]}
      />
      {edit && (
        <CardBody className="grid grid-cols-1 items-end gap-3 border-t border-borda md:grid-cols-4">
          <p className="text-sm font-medium md:col-span-4">{PARAMETROS[edit.chave].rotulo}</p>
          {PARAMETROS[edit.chave].tipo === "simnao" ? (
            <Select rotulo="Valor" vazio={false} value={edit.valor} onChange={(e) => setEdit({ ...edit, valor: e.target.value })} opcoes={[{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }]} />
          ) : (
            <Input rotulo="Valor" value={edit.valor} onChange={(e) => setEdit({ ...edit, valor: e.target.value })} placeholder={PARAMETROS[edit.chave].tipo === "dominios" ? "empresa.com.br, outra.com.br" : PARAMETROS[edit.chave].tipo === "fator" ? "1,15" : "4"} />
          )}
          <Input rotulo="Vale a partir de" type="date" value={edit.desde} onChange={(e) => setEdit({ ...edit, desde: e.target.value })} />
          <div className="flex gap-2">
            <Button onClick={async () => (await executar(async () => (await api.salvarParametro(edit.chave, PARAMETROS[edit.chave].tipo === "dominios" ? edit.valor : edit.valor.replace(",", "."), edit.desde, usuario.id), true), "Parâmetro salvo.")) && setEdit(undefined)}>Salvar</Button>
            <Button variante="secundario" onClick={() => setEdit(undefined)}>Cancelar</Button>
          </div>
        </CardBody>
      )}
    </Card>
  );
}

function Cotacoes({ ctx }: { ctx: ContextoLicencas }) {
  const { usuario, executar } = useApp();
  const [data, setData] = useState(hoje());
  const [ptax, setPtax] = useState<number>();
  const ultimas = [...ctx.dados.cotacoes].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 12);
  const atual = cotacaoNaData(ctx.dados.cotacoes, hoje());
  return (
    <Card>
      <CardHeader titulo="Cotação PTAX (venda)" subtitulo={atual ? `Em uso hoje: R$ ${formatarNumero(atual.ptaxVenda, 4)} de ${formatarData(atual.data)}` : "Nenhuma cotação cadastrada"} />
      <CardBody className="space-y-3">
        <p className="text-xs text-texto-suave">Tabela única de câmbio. Com a API real, a PTAX é carregada uma vez por dia do Banco Central; aqui, informe manualmente. Cada mês usa a cotação do seu último dia útil.</p>
        <div className="grid grid-cols-3 items-end gap-3">
          <Input rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <InputNumero rotulo="PTAX venda" valor={ptax} onValor={setPtax} placeholder="5,4321" />
          <Button onClick={async () => (await executar(async () => (await api.salvarCotacao({ data, ptaxVenda: ptax ?? 0 }, usuario.id), true), "Cotação salva.")) && setPtax(undefined)}>Salvar</Button>
        </div>
        <ul className="divide-y divide-borda rounded-md border border-borda text-sm tabular">
          {ultimas.map((c) => <li key={c.data} className="flex justify-between px-3 py-1.5"><span>{formatarData(c.data)}</span><span>R$ {formatarNumero(c.ptaxVenda, 4)}</span></li>)}
          {!ultimas.length && <li className="px-3 py-1.5 text-texto-suave">Sem cotações.</li>}
        </ul>
      </CardBody>
    </Card>
  );
}

function Orcamentos({ ctx }: { ctx: ContextoLicencas }) {
  const { usuario, executar, cad } = useApp();
  const ano = Number(hoje().slice(0, 4));
  const [f, setF] = useState({ fornecedorId: "", ano, valorBRL: undefined as number | undefined });
  const parcelas = useMemo(() => parcelasDoPeriodo(ctx.dados, `${ano}-01`, `${ano}-12`), [ctx.dados, ano]);
  const contratado = (id: string) => parcelas.filter((p) => p.fornecedorId === id).reduce((a, p) => a + (p.custoRealBRL ?? 0), 0);
  const linhas = ctx.dados.orcamentos.filter((o) => o.ano === ano);
  return (
    <Card>
      <CardHeader titulo={`Orçamento por fornecedor (${ano})`} subtitulo="Alerta quando o contratado no ano chega a 90% do orçamento" />
      <Tabela
        densa
        linhas={linhas}
        chave={(o) => o.id}
        vazio="Nenhum orçamento cadastrado."
        colunas={[
          { id: "f", titulo: "Fornecedor", render: (o) => ctx.nomeFornecedor(o.fornecedorId) },
          { id: "o", titulo: "Orçamento", alinhamento: "direita", render: (o) => formatarMoeda(o.valorBRL) },
          { id: "c", titulo: "Contratado no ano", alinhamento: "direita", render: (o) => formatarMoeda(contratado(o.fornecedorId)) },
          { id: "p", titulo: "Uso", alinhamento: "direita", render: (o) => { const pct = (contratado(o.fornecedorId) / o.valorBRL) * 100; return <Badge tom={pct >= 100 ? "critico" : pct >= 90 ? "alerta" : "neutro"}>{formatarPercentual(pct, 0)}</Badge>; } },
        ]}
      />
      <CardBody className="grid grid-cols-1 items-end gap-3 border-t border-borda md:grid-cols-4">
        <Select className="md:col-span-2" rotulo="Fornecedor" value={f.fornecedorId} onChange={(e) => setF({ ...f, fornecedorId: e.target.value })} opcoes={cad.fornecedores.map((x) => ({ valor: x.fornecedor_id, rotulo: x.nomeFantasia || x.razaoSocial })).sort((a, b) => a.rotulo.localeCompare(b.rotulo))} />
        <InputNumero rotulo="Valor (R$)" valor={f.valorBRL} onValor={(v) => setF({ ...f, valorBRL: v })} />
        <Button onClick={async () => (await executar(() => api.salvarOrcamento({ id: "", fornecedorId: f.fornecedorId, ano: f.ano, valorBRL: f.valorBRL ?? 0 }, usuario.id), "Orçamento salvo.")) && setF({ ...f, fornecedorId: "", valorBRL: undefined })}>Salvar</Button>
      </CardBody>
    </Card>
  );
}
