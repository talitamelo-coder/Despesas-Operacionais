import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarClock, DollarSign, Download, KeyRound, Landmark, PiggyBank, Users, Wallet } from "lucide-react";
import { useApp } from "@/app/contexto";
import { exportarCsv } from "@/app/exportar";
import { Badge } from "@/components/ui/Badge";
import { BarrasRanking, type ItemBarra } from "@/components/ui/BarrasRanking";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Campos";
import { Aviso, Kpi } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { Tabela } from "@/components/ui/Tabela";
import { formatarData, hoje } from "@/domain/datas";
import { formatarMoeda, formatarNumero, formatarPercentual } from "@/domain/formatacao";
import {
  alertasLicencas,
  calcularKpis,
  cambioNaData,
  competenciasEntre,
  filtrarParcelas,
  ganhosEPerdas,
  parcelasDoPeriodo,
  porColaborador,
  porFornecedor,
  rankingOfensores,
  serieMensal,
  valorExibido,
  vencimentosProximos,
  type BarraRanking,
  type DimensaoRanking,
  type MoedaExibicao,
  type ParcelaCusto,
} from "@/domain/rules/licencas";
import type { ContextoLicencas } from "./Licencas";

type Periodo = "ano" | "12m" | "anoAnterior" | "personalizado";

function intervalo(p: Periodo, ini: string, fim: string): [string, string] {
  const h = hoje();
  const ano = Number(h.slice(0, 4));
  if (p === "ano") return [`${ano}-01`, `${ano}-12`];
  if (p === "anoAnterior") return [`${ano - 1}-01`, `${ano - 1}-12`];
  if (p === "12m") {
    const [y, m] = h.slice(0, 7).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 12, 1));
    return [d.toISOString().slice(0, 7), h.slice(0, 7)];
  }
  return ini && fim && ini <= fim ? [ini, fim] : [`${ano}-01`, `${ano}-12`];
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`;
const brl = (v?: number) => formatarMoeda(v ?? 0, "BRL", true);
const usd = (v?: number) => formatarMoeda(v ?? 0, "USD", true);

export function DashboardLicencas({ ctx }: { ctx: ContextoLicencas }) {
  const { usuario } = useApp();
  const { dados } = ctx;
  const [periodo, setPeriodo] = useState<Periodo>("ano");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [area, setArea] = useState(ctx.areaFixa ?? "");
  const [centroCusto, setCentroCusto] = useState("");
  const [moeda, setMoeda] = useState<MoedaExibicao>("BRL");
  const [dimensao, setDimensao] = useState<DimensaoRanking>(ctx.agregada ? "Fornecedor" : "Usuário");
  const [ordem, setOrdem] = useState<{ coluna: string; direcao: "asc" | "desc" }>({ coluna: "total", direcao: "desc" });
  const [detalhe, setDetalhe] = useState<{ titulo: string; parcelas: ParcelaCusto[] }>();

  const [cIni, cFim] = intervalo(periodo, ini, fim);
  const custo = useMemo(
    () => ({ licencas: dados.licencas, movimentacoes: dados.movimentacoes, atribuicoes: dados.atribuicoes, colaboradores: dados.colaboradores, cotacoes: dados.cotacoes, parametros: dados.parametros }),
    [dados],
  );
  const todas = useMemo(() => parcelasDoPeriodo(custo, cIni, cFim), [custo, cIni, cFim]);
  const parcelas = useMemo(() => filtrarParcelas(todas, { fornecedorId: fornecedorId || undefined, area: area || undefined, centroCusto: centroCusto || undefined }), [todas, fornecedorId, area, centroCusto]);

  const ativas = dados.licencas.filter((l) => l.status === "Ativa" && (!fornecedorId || l.fornecedorId === fornecedorId) && (!ctx.areaFixa || l.area === ctx.areaFixa));
  const k = calcularKpis(parcelas, ativas.length);
  const cambioHoje = cambioNaData(dados.cotacoes, dados.parametros, hoje());
  const comps = competenciasEntre(cIni, cFim);
  const serie = serieMensal(parcelas, comps);
  const fornecedores = porFornecedor(parcelas, moeda);
  const ranking = rankingOfensores(parcelas, dimensao, moeda);
  const pessoas = ctx.agregada ? [] : porColaborador(parcelas, moeda);
  const vencimentos = vencimentosProximos(dados.licencas.filter((l) => !ctx.areaFixa || l.area === ctx.areaFixa), ctx.contratos);
  const gp = ganhosEPerdas({ ...custo, licencas: ativas.concat(dados.licencas.filter((l) => l.status === "Cancelada")) }, `${cIni}-01`, `${cFim}-31`);
  const alertas = ctx.podeGerir ? alertasLicencas({ ...custo, orcamentos: dados.orcamentos }, ctx.nomeFornecedor) : [];

  const opcoesArea = [...new Set(dados.colaboradores.map((c) => c.area).concat(dados.licencas.map((l) => l.area)).filter(Boolean) as string[])].sort();
  const opcoesCC = [...new Set(dados.colaboradores.map((c) => c.centroCusto).concat(dados.licencas.map((l) => l.centroCusto)).filter(Boolean) as string[])].sort();
  const opcoesForn = [...new Set(dados.licencas.map((l) => l.fornecedorId))].map((id) => ({ valor: id, rotulo: ctx.nomeFornecedor(id) })).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  const sufixoArquivo = `${cIni}_a_${cFim}`;
  const exp = (nome: string, cab: string[], linhas: (string | number | undefined)[][]) => exportarCsv(`${nome}_${sufixoArquivo}.csv`, cab, linhas, usuario.id);
  const legenda = (b: { valorBRL: number; valorUSD: number; percentual: number }) => `${brl(b.valorBRL)} · ${usd(b.valorUSD)} · ${formatarPercentual(b.percentual)}`;

  if (!dados.licencas.length) return <PrimeirosPassos ctx={ctx} />;

  const rotuloBarra = (b: BarraRanking) =>
    b.tipo !== "Item" ? b.chave : dimensao === "Usuário" ? ctx.nomeColaborador(b.chave) : dimensao === "Fornecedor" ? ctx.nomeFornecedor(b.chave) : b.chave;
  const itensRanking: ItemBarra[] = ranking.barras.map((b) => ({
    chave: b.chave,
    rotulo: rotuloBarra(b),
    valor: moeda === "BRL" ? b.valorBRL : b.valorUSD,
    legenda: legenda(b),
    resumo: b.tipo !== "Item",
    detalhe: <span>{new Set(b.parcelas.map((p) => p.licencaId)).size} licença(s) · clique para ver o detalhe</span>,
  }));

  const linhasPessoas = [...pessoas].sort((a, b) => {
    const s = ordem.direcao === "asc" ? 1 : -1;
    if (ordem.coluna === "nome") return s * ctx.nomeColaborador(a.chave).localeCompare(ctx.nomeColaborador(b.chave));
    if (ordem.coluna === "area") return s * (ctx.colaborador(a.chave)?.area ?? "").localeCompare(ctx.colaborador(b.chave)?.area ?? "");
    if (ordem.coluna === "licencas") return s * (new Set(a.parcelas.map((p) => p.licencaId)).size - new Set(b.parcelas.map((p) => p.licencaId)).size);
    return s * (moeda === "BRL" ? a.valorBRL - b.valorBRL : a.valorUSD - b.valorUSD);
  });

  return (
    <div className="space-y-4">
      {/* Filtros: uma linha acima dos gráficos */}
      <Card>
        <CardBody className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Select rotulo="Período" vazio={false} value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} opcoes={[{ valor: "ano", rotulo: "Ano atual" }, { valor: "12m", rotulo: "Últimos 12 meses" }, { valor: "anoAnterior", rotulo: "Ano anterior" }, { valor: "personalizado", rotulo: "Personalizado" }]} />
          {periodo === "personalizado" && (
            <>
              <Input rotulo="De" type="month" value={ini} onChange={(e) => setIni(e.target.value)} />
              <Input rotulo="Até" type="month" value={fim} onChange={(e) => setFim(e.target.value)} />
            </>
          )}
          <Select rotulo="Fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} opcoes={opcoesForn} vazio="Todos" />
          <Select rotulo="Área" value={area} disabled={Boolean(ctx.areaFixa)} onChange={(e) => setArea(e.target.value)} opcoes={opcoesArea.map((a) => ({ valor: a, rotulo: a }))} vazio="Todas" />
          <Select rotulo="Centro de custo" value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)} opcoes={opcoesCC.map((a) => ({ valor: a, rotulo: a }))} vazio="Todos" />
          <Select rotulo="Moeda de exibição" vazio={false} value={moeda} onChange={(e) => setMoeda(e.target.value as MoedaExibicao)} opcoes={[{ valor: "BRL", rotulo: "Reais" }, { valor: "USD", rotulo: "Dólares" }]} />
        </CardBody>
      </Card>

      {k.semCambio > 0 && (
        <Aviso tom="critico" titulo="Câmbio incompleto">
          Há custos em USD sem PTAX, spread ou IOF configurados: eles não entram nos valores em reais. {ctx.podeGerir && <button className="underline" onClick={() => ctx.irPara("configuracao")}>Configurar câmbio e parâmetros</button>}
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi rotulo="Gasto em dólar" valor={usd(k.gastoUSD)} detalhe={`Equivale a ${brl(k.gastoUSDemBRL)} com câmbio, spread e IOF`} icone={<DollarSign size={18} />} />
        <Kpi rotulo="Gasto em reais (custo real)" valor={brl(k.gastoBRL)} detalhe="Valor convertido + IOF. Base de todos os gráficos" icone={<Wallet size={18} />} />
        <Kpi rotulo="Custo ocioso" valor={moeda === "BRL" ? brl(k.ociosoBRL) : usd(k.ociosoUSD)} detalhe="Assentos pagos sem pessoa atribuída" icone={<AlertTriangle size={18} />} tom={k.ociosoBRL > 0 ? "alerta" : "neutro"} />
        <Kpi rotulo="Licenças ativas" valor={formatarNumero(k.licencasAtivas)} detalhe={`${dados.licencas.filter((l) => l.status === "Cancelada").length} cancelada(s) no histórico`} icone={<KeyRound size={18} />} />
        <Kpi rotulo="Custo médio por usuário" valor={moeda === "BRL" ? brl(k.custoMedioPorUsuarioBRL) : usd(k.custoMedioPorUsuarioUSD)} detalhe={`${formatarNumero(k.pessoasComCusto)} pessoa(s) com licença no período`} icone={<Users size={18} />} />
        {cambioHoje.exibirImpostos && k.exposicaoTributariaBRL !== undefined ? (
          <div className="rounded-[var(--radius-cartao)] border border-dashed border-borda-forte bg-fundo p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-texto-suave">Exposição tributária simulada</p>
              <Landmark size={18} className="text-texto-fraco" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular text-texto-suave">{brl(k.exposicaoTributariaBRL)}</p>
            <p className="mt-1 text-xs text-texto-fraco">Simulação “e se fosse tributado” (fator {formatarNumero(cambioHoje.fatorImpostos, 2)}). Não entra em nenhum total.</p>
          </div>
        ) : (
          <Kpi rotulo="Câmbio de hoje" valor={cambioHoje.ptax ? `R$ ${formatarNumero(cambioHoje.ptax, 4)}` : "—"} detalhe={cambioHoje.ptax ? `PTAX de ${formatarData(cambioHoje.dataPtax)} · spread ${formatarNumero(cambioHoje.spreadPercentual, 2)}% · IOF ${formatarNumero(cambioHoje.iofPercentual, 2)}%` : "Sem cotação cadastrada"} icone={<DollarSign size={18} />} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            titulo="Gasto mensal em dólar"
            subtitulo="Custo original das licenças em USD; o equivalente em reais está ao lado"
            acoes={<Exportar onClick={() => exp("gasto-mensal-usd", ["competencia", "usd", "equivalente_brl", "total_brl"], serie.map((s) => [s.competencia, s.usd, s.usdEmBRL, s.totalBRL]))} />}
          />
          <CardBody className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_15rem]">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-borda)" />
                  <XAxis dataKey="competencia" tickFormatter={rotuloMes} tick={{ fontSize: 11, fill: "var(--color-texto-fraco)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => usd(Number(v))} width={70} tick={{ fontSize: 11, fill: "var(--color-texto-fraco)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    labelFormatter={(c) => rotuloMes(String(c))}
                    formatter={(v, _n, item) => [`${formatarMoeda(Number(v), "USD")} (≈ ${formatarMoeda((item.payload as { usdEmBRL: number }).usdEmBRL)})`, "Gasto"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--color-borda)", fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="usd" stroke="var(--color-primaria-600)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--color-superficie)" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="max-h-56 overflow-auto rounded-md border border-borda">
              <table className="w-full text-xs tabular">
                <thead className="sticky top-0 bg-fundo text-texto-suave">
                  <tr><th className="px-2 py-1.5 text-left font-medium">Mês</th><th className="px-2 py-1.5 text-right font-medium">US$</th><th className="px-2 py-1.5 text-right font-medium">R$</th></tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {serie.map((s) => (
                    <tr key={s.competencia}><td className="px-2 py-1">{rotuloMes(s.competencia)}</td><td className="px-2 py-1 text-right">{usd(s.usd)}</td><td className="px-2 py-1 text-right">{brl(s.usdEmBRL)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader titulo="Gasto por fornecedor" subtitulo={`Do maior para o menor · % do total (${moeda === "BRL" ? "custo real" : "US$"})`} acoes={<Exportar onClick={() => exp("gasto-por-fornecedor", ["fornecedor", "custo_real_brl", "usd", "percentual"], fornecedores.map((f) => [ctx.nomeFornecedor(f.chave), f.valorBRL, f.valorUSD, f.percentual]))} />} />
          <CardBody>
            <BarrasRanking
              itens={fornecedores.map((f) => ({ chave: f.chave, rotulo: ctx.nomeFornecedor(f.chave), valor: moeda === "BRL" ? f.valorBRL : f.valorUSD, legenda: legenda(f) }))}
              onClique={(i) => setDetalhe({ titulo: i.rotulo, parcelas: fornecedores.find((f) => f.chave === i.chave)!.parcelas })}
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          titulo="Ofensores: maiores gastos"
          subtitulo={`Top 15 do maior para o menor. As barras finais fecham o total de ${brl(ranking.totalBRL)} (${usd(ranking.totalUSD)}). Clique para ver as licenças.`}
          acoes={
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-borda-forte p-0.5" role="radiogroup" aria-label="Agrupar por">
                {(["Usuário", "Fornecedor", "Área"] as const).filter((d) => !(ctx.agregada && d === "Usuário")).map((d) => (
                  <button key={d} role="radio" aria-checked={dimensao === d} onClick={() => setDimensao(d)} className={`h-7 rounded px-3 text-xs font-medium ${dimensao === d ? "bg-primaria-800 text-white" : "text-texto-suave hover:bg-fundo"}`}>{d}</button>
                ))}
              </div>
              <Exportar onClick={() => exp(`ofensores-por-${dimensao.toLowerCase()}`, [dimensao.toLowerCase(), "custo_real_brl", "usd", "percentual"], ranking.barras.map((b) => [rotuloBarra(b), b.valorBRL, b.valorUSD, b.percentual]))} />
            </div>
          }
        />
        <CardBody>
          <BarrasRanking itens={itensRanking} onClique={(i) => setDetalhe({ titulo: i.rotulo, parcelas: ranking.barras.find((b) => b.chave === i.chave)!.parcelas })} />
        </CardBody>
      </Card>

      {!ctx.agregada && (
        <Card>
          <CardHeader
            titulo="Gasto por usuário"
            subtitulo="Rateio: custo da licença ÷ assentos faturados × assentos da pessoa. Dado pessoal: acesso restrito."
            acoes={<Exportar onClick={() => exp("gasto-por-usuario", ["pessoa", "email", "area", "licencas", "custo_real_brl", "usd"], linhasPessoas.map((p) => [ctx.nomeColaborador(p.chave), ctx.colaborador(p.chave)?.email, ctx.colaborador(p.chave)?.area, new Set(p.parcelas.map((x) => x.licencaId)).size, p.valorBRL, p.valorUSD]))} />}
          />
          <div className="max-h-96 overflow-auto">
            <Tabela
              densa
              linhas={linhasPessoas}
              chave={(p) => p.chave}
              ordenacao={ordem}
              onOrdenar={(c) => setOrdem((o) => ({ coluna: c, direcao: o.coluna === c && o.direcao === "desc" ? "asc" : "desc" }))}
              onLinha={(p) => setDetalhe({ titulo: ctx.nomeColaborador(p.chave), parcelas: p.parcelas })}
              vazio="Nenhuma pessoa com licença no período."
              colunas={[
                { id: "nome", titulo: "Pessoa", ordenavel: true, render: (p) => <span className="font-medium">{ctx.nomeColaborador(p.chave)}{ctx.colaborador(p.chave)?.status === "Desligado" && <Badge tom="critico" className="ml-2">Desligado</Badge>}</span> },
                { id: "area", titulo: "Área", ordenavel: true, render: (p) => ctx.colaborador(p.chave)?.area ?? "—" },
                { id: "licencas", titulo: "Licenças", ordenavel: true, alinhamento: "direita", render: (p) => new Set(p.parcelas.map((x) => x.licencaId)).size },
                { id: "total", titulo: moeda === "BRL" ? "Custo real (R$)" : "Total (US$)", ordenavel: true, alinhamento: "direita", render: (p) => (moeda === "BRL" ? formatarMoeda(p.valorBRL) : formatarMoeda(p.valorUSD, "USD")) },
                { id: "pct", titulo: "% do total", alinhamento: "direita", render: (p) => formatarPercentual(p.percentual) },
              ]}
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader titulo="Vencimentos nos próximos 90 dias" subtitulo="Licença com contrato usa a vigência e os alertas de renovação do contrato" icone={<CalendarClock size={16} />} acoes={<Exportar onClick={() => exp("vencimentos-90-dias", ["licenca", "origem", "data", "dias", "data_limite_manifestacao"], vencimentos.map((v) => [ctx.licenca(v.licencaId)?.produto, v.origem === "contrato" ? v.contratoCodigo : "licença", v.data, v.dias, v.dataLimiteManifestacao]))} />} />
          {vencimentos.length ? (
            <ul className="divide-y divide-borda">
              {vencimentos.map((v) => (
                <li key={v.licencaId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <button className="font-medium hover:underline" onClick={() => ctx.irPara("licencas", v.licencaId)}>{ctx.licenca(v.licencaId)?.produto}</button>
                    <span className="ml-2 text-xs text-texto-suave">{v.origem === "contrato" ? `Contrato ${v.contratoCodigo}${v.dataLimiteManifestacao ? ` · manifestar até ${formatarData(v.dataLimiteManifestacao)}` : ""}` : "Vencimento da licença"}</span>
                  </span>
                  <span className="text-xs tabular text-texto-suave">{formatarData(v.data)}</span>
                  <Badge tom={v.dias <= 30 ? "critico" : "alerta"}>{v.dias} dia(s)</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody><p className="text-sm text-texto-suave">Nenhum vencimento nos próximos 90 dias.</p></CardBody>
          )}
        </Card>
        <Card>
          <CardHeader
            titulo="Ganhos e perdas"
            subtitulo="Variação anual do contratado: economias registradas versus aumentos"
            icone={<PiggyBank size={16} />}
            acoes={<Exportar onClick={() => exp("ganhos-e-perdas", ["data", "licenca", "tipo", "responsavel", "variacao_anual_original", "moeda", "variacao_anual_brl"], gp.itens.map((i) => [i.movimentacao.data, ctx.licenca(i.movimentacao.licencaId)?.produto, i.movimentacao.tipo, i.movimentacao.responsavel, i.variacaoAnualOriginal, ctx.licenca(i.movimentacao.licencaId)?.moeda, i.variacaoAnualBRL]))} />}
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-sucesso-50 p-3"><p className="text-xs text-sucesso-600">Economias (ao ano)</p><p className="text-lg font-semibold tabular text-sucesso-600">{brl(gp.economiaBRL)}</p></div>
              <div className="rounded-md bg-alerta-50 p-3"><p className="text-xs text-alerta-600">Aumentos (ao ano)</p><p className="text-lg font-semibold tabular text-alerta-600">{brl(gp.aumentoBRL)}</p></div>
            </div>
            <ul className="divide-y divide-borda text-sm">
              {gp.itens.slice(0, 6).map((i) => (
                <li key={i.movimentacao.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-20 shrink-0 text-xs tabular text-texto-suave">{formatarData(i.movimentacao.data)}</span>
                  <span className="min-w-0 flex-1 truncate">{i.movimentacao.tipo} · {ctx.licenca(i.movimentacao.licencaId)?.produto}</span>
                  <span className={`text-xs font-medium tabular ${i.variacaoAnualOriginal < 0 ? "text-sucesso-600" : "text-alerta-600"}`}>{i.variacaoAnualOriginal < 0 ? "−" : "+"}{brl(Math.abs(i.variacaoAnualBRL ?? 0))}</span>
                </li>
              ))}
              {!gp.itens.length && <li className="py-1.5 text-texto-suave">Nenhuma movimentação no período.</li>}
            </ul>
          </CardBody>
        </Card>
      </div>

      {alertas.length > 0 && (
        <Card>
          <CardHeader titulo={`Alertas (${alertas.length})`} subtitulo="Desligados com licença, consumo sem limite, orçamento e câmbio" icone={<AlertTriangle size={16} />} />
          <ul className="divide-y divide-borda">
            {alertas.map((a, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Badge tom={a.gravidade === "Crítico" ? "critico" : "alerta"}>{a.tipo}</Badge>
                <span>{a.mensagem}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DetalheParcelas detalhe={detalhe} ctx={ctx} moeda={moeda} onFechar={() => setDetalhe(undefined)} />
    </div>
  );
}

function Exportar({ onClick }: { onClick: () => void }) {
  return (
    <Button variante="fantasma" tamanho="sm" icone={<Download size={14} />} onClick={onClick}>
      CSV
    </Button>
  );
}

function DetalheParcelas({ detalhe, ctx, moeda, onFechar }: { detalhe?: { titulo: string; parcelas: ParcelaCusto[] }; ctx: ContextoLicencas; moeda: MoedaExibicao; onFechar: () => void }) {
  const linhas = useMemo(() => {
    const g = new Map<string, { licencaId: string; brl: number; usd: number; tipos: Set<string>; pessoas: Set<string> }>();
    for (const p of detalhe?.parcelas ?? []) {
      const x = g.get(p.licencaId) ?? { licencaId: p.licencaId, brl: 0, usd: 0, tipos: new Set(), pessoas: new Set() };
      x.brl += p.custoRealBRL ?? 0;
      x.usd += p.valorUSD ?? 0;
      x.tipos.add(p.tipo);
      if (p.colaboradorId) x.pessoas.add(p.colaboradorId);
      g.set(p.licencaId, x);
    }
    return [...g.values()].sort((a, b) => (moeda === "BRL" ? b.brl - a.brl : b.usd - a.usd));
  }, [detalhe, moeda]);
  return (
    <Modal aberto={Boolean(detalhe)} titulo={`Detalhe: ${detalhe?.titulo ?? ""}`} onFechar={onFechar} largura="lg">
      <Tabela
        densa
        linhas={linhas}
        chave={(l) => l.licencaId}
        onLinha={(l) => (onFechar(), ctx.irPara("licencas", l.licencaId))}
        colunas={[
          { id: "lic", titulo: "Licença", render: (l) => <span className="font-medium">{ctx.licenca(l.licencaId)?.produto} <span className="text-xs text-texto-suave">{ctx.licenca(l.licencaId)?.plano}</span></span> },
          { id: "forn", titulo: "Fornecedor", render: (l) => ctx.nomeFornecedor(ctx.licenca(l.licencaId)?.fornecedorId) },
          { id: "tipo", titulo: "Composição", render: (l) => [...l.tipos].join(", ") + (l.pessoas.size ? ` · ${l.pessoas.size} pessoa(s)` : "") },
          { id: "brl", titulo: "Custo real (R$)", alinhamento: "direita", render: (l) => formatarMoeda(l.brl) },
          { id: "usd", titulo: "US$", alinhamento: "direita", render: (l) => formatarMoeda(l.usd, "USD") },
        ]}
      />
      <p className="mt-2 text-xs text-texto-fraco">Valores do período filtrado. Dólares: original para licenças em USD; reais ÷ PTAX para licenças em BRL. Total exibido: {formatarMoeda(linhas.reduce((a, l) => a + valorExibido({ custoRealBRL: l.brl, valorUSD: l.usd }, moeda), 0), moeda === "BRL" ? "BRL" : "USD")}.</p>
    </Modal>
  );
}

function PrimeirosPassos({ ctx }: { ctx: ContextoLicencas }) {
  const passos: { titulo: string; texto: string; aba?: Parameters<ContextoLicencas["irPara"]>[0] }[] = [
    { titulo: "Câmbio e parâmetros", texto: "Spread cambial, IOF sobre USD, domínios de e-mail do grupo e a PTAX. Sem isso, licenças em dólar ficam sem custo em reais.", aba: "configuracao" },
    { titulo: "Fornecedores", texto: "Use os fornecedores já cadastrados em Contratos. Na importação por CSV, fornecedor novo entra como pré-cadastro." },
    { titulo: "Licenças", texto: "Cadastre cada licença com a compra inicial (assentos, preço e data) e, se houver, o contrato vinculado. Ou importe o CSV.", aba: "licencas" },
    { titulo: "Pessoas e atribuições", texto: "Cadastre quem usa (o e-mail corporativo é a identidade) e atribua os assentos. O sistema não deixa passar do contratado.", aba: "pessoas" },
  ];
  return (
    <Card>
      <CardHeader titulo="Comece por aqui" subtitulo="A base de licenças está vazia. Siga os passos; o dashboard se monta sozinho." />
      <CardBody>
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {passos.map((p, i) => (
            <li key={p.titulo} className="rounded-md border border-borda p-4">
              <p className="text-xs font-semibold text-primaria-800">Passo {i + 1}</p>
              <p className="mt-1 font-semibold">{p.titulo}</p>
              <p className="mt-1 text-sm text-texto-suave">{p.texto}</p>
              {p.aba && ctx.podeGerir && (
                <Button className="mt-3" variante="secundario" tamanho="sm" onClick={() => ctx.irPara(p.aba!)}>Abrir</Button>
              )}
            </li>
          ))}
        </ol>
        {ctx.podeGerir && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-texto-suave">
            Tem uma planilha? <Button tamanho="sm" onClick={() => ctx.irPara("importar")}>Importar CSV com modelo</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
