import { useNavigate } from "react-router-dom";
import { AlarmClock, AlertTriangle, BadgeDollarSign, CalendarClock, FileCheck2, ListChecks, PiggyBank, RefreshCw } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Carregando, Kpi } from "@/components/ui/Diversos";
import { GraficoBarras } from "@/components/ui/GraficoBarras";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrioridadeBadge } from "@/components/ui/status";
import { Button } from "@/components/ui/Button";
import { formatarData } from "@/domain/datas";
import { formatarMoeda, formatarPercentual } from "@/domain/formatacao";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

export function Dashboard() {
  const navegar = useNavigate();
  const { nomeUsuario, usuario, cad } = useApp();
  const { dados: ind } = useConsulta(() => api.obterIndicadores(), []);
  const { dados: acoes } = useConsulta(() => api.listarAcoes(), []);
  if (!ind) return <Carregando />;
  const pctSuprimentos = ind.savingAnualTotal ? (ind.savingSuprimentos / ind.savingAnualTotal) * 100 : 0;

  return (
    <>
      <PageHeader
        titulo="Dashboard de Contratos"
        descricao={`Olá, ${usuario.nome.split(" ")[0]}. Visão consolidada de contratos vigentes, prazos e saving.`}
        acoes={
          <>
            <Button variante="secundario" onClick={() => navegar("/contratos")}>Central de Contratos</Button>
            <Button onClick={() => navegar("/processos/novo")}>Novo processo</Button>
          </>
        }
      />

      {cad.modo === "demonstracao" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-cartao)] border border-alerta-50 bg-alerta-50 px-4 py-3 text-sm text-alerta-600">
          <span>Você está vendo <b>dados fictícios</b> de demonstração.</span>
          <Button variante="secundario" tamanho="sm" onClick={() => navegar("/admin")}>Começar com dados reais</Button>
        </div>
      )}
      {cad.modo === "real" && ind.contratosVigentes === 0 && (
        <div className="mb-4 rounded-[var(--radius-cartao)] border border-info-50 bg-info-50 px-4 py-3 text-sm text-info-600">
          <b>Base vazia.</b> Comece em Administração: cadastre empresas, usuários e fornecedores, e importe a planilha atual de contratos (Administração → Importação da planilha).
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Contratos vigentes" valor={ind.contratosVigentes} icone={<FileCheck2 size={18} />} onClick={() => navegar("/contratos?aba=Vigentes")} />
        <Kpi rotulo="Valor anual contratado" valor={formatarMoeda(ind.valorAnualContratado, "BRL", true)} detalhe="Contratos vigentes, convertido em BRL" icone={<BadgeDollarSign size={18} />} />
        <Kpi rotulo="Saving anual total" valor={formatarMoeda(ind.savingAnualTotal, "BRL", true)} detalhe="Sobre o baseline de cada contrato vigente" icone={<PiggyBank size={18} />} tom="sucesso" />
        <Kpi
          rotulo="Saving originado por Suprimentos"
          valor={formatarMoeda(ind.savingSuprimentos, "BRL", true)}
          detalhe={`${formatarPercentual(pctSuprimentos)} do saving total`}
          icone={<PiggyBank size={18} />}
          tom="sucesso"
        />
        <Kpi rotulo="Contratos em renovação" valor={ind.contratosEmRenovacao} detalhe="Renovação, substituição ou renegociação em curso" icone={<RefreshCw size={18} />} onClick={() => navegar("/contratos?aba=Em renovação")} />
        <Kpi
          rotulo="Vencendo em 30 / 60 / 90 dias"
          valor={
            <span>
              {ind.vencendo30} <span className="text-texto-fraco">/</span> {ind.vencendo60} <span className="text-texto-fraco">/</span> {ind.vencendo90}
            </span>
          }
          detalhe="Contagem acumulada por janela"
          icone={<CalendarClock size={18} />}
          tom="alerta"
          onClick={() => navegar("/contratos?aba=Vigentes&vencimento=90")}
        />
        <Kpi rotulo="Ações pendentes" valor={ind.acoesPendentes} detalhe={`${ind.acoesCriticas} críticas`} icone={<ListChecks size={18} />} tom={ind.acoesCriticas ? "critico" : "neutro"} onClick={() => navegar("/acoes")} />
        <Kpi rotulo="Renovação automática em risco" valor={ind.renovacaoAutomaticaEmRisco} detalhe="Data limite próxima sem resolução formal" icone={<AlertTriangle size={18} />} tom={ind.renovacaoAutomaticaEmRisco ? "critico" : "neutro"} onClick={() => navegar("/contratos?aba=Vigentes&renovacaoAutomatica=sim")} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader titulo="Ações prioritárias" subtitulo="Pendências com prazo — clique para atuar" icone={<AlarmClock size={16} />} acoes={<Button variante="fantasma" tamanho="sm" onClick={() => navegar("/acoes")}>Ver todas</Button>} />
          <ul className="divide-y divide-borda">
            {(acoes ?? []).filter((a, i, l) => l.findIndex((x) => x.referencia.id === a.referencia.id) === i).slice(0, 7).map((a) => (
              <li key={a.id}>
                <button onClick={() => navegar(a.link)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-fundo">
                  <span className="w-32 shrink-0"><PrioridadeBadge prioridade={a.prioridade} /></span>
                  <span className="w-28 shrink-0 text-xs font-semibold text-primaria-800">{a.referencia.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{a.acao}</span>
                  <span className="hidden w-36 shrink-0 truncate text-xs text-texto-suave md:block">{nomeUsuario(a.responsavelId)}</span>
                  <span className="w-20 shrink-0 text-right text-xs text-texto-suave tabular">{formatarData(a.prazo)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader titulo="Saving por origem" subtitulo="Composição do saving anual (BRL)" />
          <CardBody>
            <GraficoBarras dados={ind.savingPorOrigem} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader titulo="Contratos por empresa" subtitulo="Valor anual dos contratos vigentes" />
          <CardBody><GraficoBarras dados={ind.contratosPorEmpresa} /></CardBody>
        </Card>
        <Card>
          <CardHeader titulo="Contratos por tipo" subtitulo="Valor anual dos contratos vigentes" />
          <CardBody><GraficoBarras dados={ind.contratosPorTipo} /></CardBody>
        </Card>
        <Card>
          <CardHeader titulo="Contratos por fornecedor" subtitulo="Top 10 por valor anual" />
          <CardBody><GraficoBarras dados={ind.contratosPorFornecedor} /></CardBody>
        </Card>
        <Card>
          <CardHeader titulo="Saving por analista" subtitulo="Saving anual dos contratos vigentes" />
          <CardBody><GraficoBarras dados={ind.savingPorAnalista} /></CardBody>
        </Card>
      </div>
    </>
  );
}
