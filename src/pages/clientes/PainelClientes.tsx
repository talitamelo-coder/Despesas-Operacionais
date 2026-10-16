import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Building2, CalendarClock, Repeat, TrendingUp } from "lucide-react";
import { useApp } from "@/app/contexto";
import { exportarCsv } from "@/app/exportar";
import { Badge, type Tom } from "@/components/ui/Badge";
import { BarrasRanking } from "@/components/ui/BarrasRanking";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Carregando, Kpi, Vazio } from "@/components/ui/Diversos";
import { Tabela } from "@/components/ui/Tabela";
import { formatarData, hoje } from "@/domain/datas";
import { formatarMoeda, formatarPercentual } from "@/domain/formatacao";
import { pendenciasCadastro } from "@/domain/rules/cadastro";
import { montarPainelClientes, type AgregadoPainel, type GravidadeAlertaCliente, type LinhaPainelCliente } from "@/domain/rules/painelClientes";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

const TOM: Record<GravidadeAlertaCliente, Tom> = { critico: "critico", alerta: "alerta", info: "info" };
const ROTULO: Record<GravidadeAlertaCliente, string> = { critico: "Crítico", alerta: "Atenção", info: "Informativo" };

/**
 * Painel dos contratos de clientes: o que a planilha de controle mostrava (receita mensal estimada,
 * status de vigência, tipo de receita, responsável), calculado a partir do registrado e com alertas.
 */
export function PainelClientes() {
  const navegar = useNavigate();
  const { usuario, cliente, nomeUsuario } = useApp();
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);
  const { dados: saldos } = useConsulta(() => api.listarSaldos("Receita", usuario.id), [usuario.id]);
  const [gravidade, setGravidade] = useState<GravidadeAlertaCliente | "">("");
  const h = hoje();
  const nomeCliente = (id?: string) => cliente(id)?.nomeFantasia || cliente(id)?.razaoSocial || "—";
  const p = useMemo(
    () => (contratos ? montarPainelClientes(contratos.filter((c) => c.natureza === "Receita"), h, { saldos: saldos ?? undefined, nomeCliente, pendencias: (c) => pendenciasCadastro(c) }) : undefined),
    [contratos, saldos, h],
  );
  if (!p) return <Carregando />;
  if (!p.linhas.length) return <Card><CardBody><Vazio titulo="Nenhum contrato de cliente ativo" descricao="Registre ou importe os contratos na aba Importar para ver o painel." /></CardBody></Card>;

  const m = (v: number) => formatarMoeda(v, "BRL", true);
  const pct = (v: number) => (p.receitaMensal ? formatarPercentual((v / p.receitaMensal) * 100, 0) : "—");
  const barras = (lista: AgregadoPainel[], rotulo: (k: string) => string) =>
    lista.map((a) => ({ chave: a.chave, rotulo: rotulo(a.chave), valor: a.valor, legenda: `${m(a.valor)} · ${pct(a.valor)} · ${a.quantidade} contrato(s)` }));
  const alertas = p.alertas.filter((a) => !gravidade || a.gravidade === gravidade);
  const conta = (g: GravidadeAlertaCliente) => p.alertas.filter((a) => a.gravidade === g).length;
  const vencimentos = [...p.linhas].sort((a, b) => (a.dias ?? 99999) - (b.dias ?? 99999));
  const fim = (l: LinhaPainelCliente) => (l.contrato.vigencia.tipoVigencia === "Prazo indeterminado" ? "Indeterminado" : formatarData(l.contrato.vigencia.dataFim));
  const situacao = (l: LinhaPainelCliente) =>
    l.faixa === "Vencido" ? `Vencido há ${Math.abs(l.dias ?? 0)} dia(s)` : l.faixa === "Prazo indeterminado" ? ((l.dias ?? 0) < 0 ? `Revisão anual atrasada há ${-(l.dias ?? 0)} dia(s)` : `Revisão anual em ${l.dias} dia(s)`) : l.faixa === "Sem vigência" ? "Sem vigência" : `Vence em ${l.dias} dia(s)`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi rotulo="Receita mensal contratada" valor={m(p.receitaMensal)} detalhe={`Fixa ${m(p.receitaFixa)} · variável estimada ${m(p.receitaMensal - p.receitaFixa)}`} icone={<TrendingUp size={18} />} />
        <Kpi rotulo="Receita anualizada" valor={m(p.receitaAnual)} detalhe={`${p.linhas.length} contrato(s) gerando receita`} icone={<Repeat size={18} />} />
        <Kpi rotulo="Receita em risco" valor={m(p.emRisco.valor)} detalhe={`${pct(p.emRisco.valor)} · ${p.emRisco.quantidade} vencido(s) ou vencendo em até 90 dias`} icone={<AlertTriangle size={18} />} tom={p.emRisco.quantidade ? "critico" : "neutro"} />
        <Kpi rotulo="Renovação automática / indeterminado" valor={m(p.renovacaoAutomatica.valor)} detalhe={`${p.renovacaoAutomatica.quantidade} contrato(s) · revisão anual`} icone={<CalendarClock size={18} />} />
        <Kpi rotulo="Concentração no maior cliente" valor={p.concentracao ? formatarPercentual(p.concentracao.percentual, 0) : "—"} detalhe={p.concentracao ? nomeCliente(p.concentracao.clienteId) : "—"} icone={<Building2 size={18} />} tom={p.concentracao && p.concentracao.percentual > 50 ? "alerta" : "neutro"} />
      </div>

      <Card>
        <CardHeader
          titulo="Alertas"
          subtitulo="Calculados a partir do registrado. Os de vencimento também chegam ao gestor em Ações Necessárias."
          acoes={
            <div className="flex flex-wrap gap-1.5">
              {(["", "critico", "alerta", "info"] as const).map((g) => (
                <button key={g || "todos"} type="button" onClick={() => setGravidade(g)} className={`rounded-full border px-2.5 py-1 text-xs ${gravidade === g ? "border-primaria-800 bg-primaria-800 text-white" : "border-borda-forte hover:bg-fundo"}`}>
                  {g ? `${ROTULO[g]} (${conta(g)})` : `Todos (${p.alertas.length})`}
                </button>
              ))}
            </div>
          }
        />
        {alertas.length ? (
          <ul className="max-h-96 divide-y divide-borda overflow-auto">
            {alertas.map((a, i) => (
              <li key={`${a.contrato_id}-${i}`}>
                <button type="button" disabled={!a.contrato_id} onClick={() => a.contrato_id && navegar(`/contratos/${a.contrato_id}`)} className="flex w-full items-start gap-3 px-5 py-2.5 text-left hover:bg-fundo disabled:cursor-default disabled:hover:bg-transparent">
                  <Badge tom={TOM[a.gravidade]}>{ROTULO[a.gravidade]}</Badge>
                  <span className="min-w-0 text-sm"><span className="font-medium">{a.titulo}</span><span className="block text-xs text-texto-suave">{a.detalhe}</span></span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <CardBody><Vazio titulo="Nenhum alerta" /></CardBody>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader titulo="Receita mensal por cliente" />
          <CardBody><BarrasRanking itens={barras(p.porCliente, nomeCliente)} /></CardBody>
        </Card>
        <Card>
          <CardHeader titulo="Receita por vencimento" subtitulo="Quanto da receita mensal vence em cada faixa" />
          <CardBody><BarrasRanking itens={barras(p.porFaixa, (k) => k).map((i) => ({ ...i, resumo: i.chave === "Prazo indeterminado" }))} /></CardBody>
        </Card>
        <Card>
          <CardHeader titulo="Receita por tipo" subtitulo="Contratos com receita apurada em outro contrato não entram" />
          <CardBody><BarrasRanking itens={barras(p.porTipo, (k) => k)} /></CardBody>
        </Card>
        <Card>
          <CardHeader titulo="Receita por gestor do contrato" />
          <CardBody><BarrasRanking itens={barras(p.porGestor, (k) => nomeUsuario(k))} /></CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          titulo="Contratos por vencimento"
          subtitulo="Mesma visão da planilha de controle: fim da vigência, situação, receita mensal estimada, tipo e responsável"
          acoes={
            <Button variante="secundario" tamanho="sm" onClick={() => exportarCsv("painel-contratos-clientes.csv", ["contrato", "cliente", "objeto", "fim_vigencia", "situacao", "receita_mensal_brl", "tipo_receita", "gestor", "saldo_a_faturar"], vencimentos.map((l) => [l.contrato.codigo, nomeCliente(l.contrato.clienteId), l.contrato.objeto, fim(l), situacao(l), l.receitaBRL.toFixed(2).replace(".", ","), l.apuradaEmOutro ? "No contrato principal" : l.contrato.receita?.tipoReceita, nomeUsuario(l.contrato.gestorId), saldos?.[l.contrato.contrato_id]?.indisponivel ? "" : saldos?.[l.contrato.contrato_id]?.disponivel.toFixed(2).replace(".", ",")]), usuario.id)}>
              Exportar CSV
            </Button>
          }
        />
        <Tabela
          linhas={vencimentos}
          chave={(l) => l.contrato.contrato_id}
          onLinha={(l) => navegar(`/contratos/${l.contrato.contrato_id}`)}
          minLargura="min-w-[1000px]"
          colunas={[
            { id: "c", titulo: "Contrato", render: (l) => <span><span className="font-semibold text-primaria-800">{l.contrato.objeto}</span><span className="block text-xs text-texto-suave">{l.contrato.codigo}{l.contrato.external_id ? ` · nº ${l.contrato.external_id}` : ""}</span></span> },
            { id: "cl", titulo: "Cliente", render: (l) => nomeCliente(l.contrato.clienteId) },
            { id: "f", titulo: "Fim da vigência", render: (l) => fim(l) },
            { id: "s", titulo: "Situação", render: (l) => <Badge tom={l.faixa === "Vencido" || l.faixa === "Sem vigência" ? "critico" : l.faixa === "Até 90 dias" ? "alerta" : l.contrato.status === "Cancelado" ? "neutro" : "sucesso"}>{l.contrato.status === "Cancelado" ? `Cancelado · ${situacao(l)}` : situacao(l)}</Badge> },
            { id: "r", titulo: "Receita mensal", alinhamento: "direita", render: (l) => (l.apuradaEmOutro ? <span className="text-xs text-texto-suave">No contrato principal</span> : formatarMoeda(l.receitaBRL)) },
            { id: "t", titulo: "Tipo", render: (l) => l.contrato.receita?.tipoReceita },
            { id: "g", titulo: "Gestor", render: (l) => nomeUsuario(l.contrato.gestorId) },
            { id: "sd", titulo: "Saldo a faturar", alinhamento: "direita", render: (l) => { const s = saldos?.[l.contrato.contrato_id]; return !s || s.indisponivel ? <span className="text-xs text-texto-fraco">—</span> : <span className={s.percentualConsumido >= 80 ? "text-alerta-600" : ""}>{formatarMoeda(s.disponivel, s.moeda, true)}<span className="block text-xs text-texto-suave">{formatarPercentual(s.percentualConsumido, 0)} usado</span></span>; } },
          ]}
        />
      </Card>
      <p className="text-xs text-texto-fraco">Receita mensal = fixo vigente (com valores previstos no contrato) + variável estimado, em R$ (moeda estrangeira pela cotação do contrato). Entram contratos vigentes e cancelados que ainda correm até o fim. O realizado vem do Contas a receber.</p>
    </div>
  );
}
