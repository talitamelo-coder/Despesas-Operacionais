import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, Mail } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Toggle } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabela } from "@/components/ui/Tabela";
import { Tabs } from "@/components/ui/Tabs";
import { PrioridadeBadge, RiscoRenovacaoBadge } from "@/components/ui/status";
import { valorAnualBRL } from "@/domain/rules/cambio";
import { dataLimiteManifestacao } from "@/domain/rules/prazos";
import { diffDias, formatarData, hoje } from "@/domain/datas";
import { renderizarEmailAvaliacao, type EmailRenderizado } from "@/domain/templates/email";
import type { AcaoNecessaria, Alerta, Contrato, Prioridade } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

const NIVEIS: Prioridade[] = ["Crítico", "Ação necessária", "Atenção", "Normal"];

export function AcoesNecessarias() {
  const [aba, setAba] = useState<"pendencias" | "alertas">("pendencias");
  return (
    <>
      <PageHeader titulo="Ações Necessárias" descricao="Pendências priorizadas com link direto para atuação, e alertas de renovação (e-mail + sistema)." />
      <Tabs className="mb-4" abas={[{ id: "pendencias", rotulo: "Pendências" }, { id: "alertas", rotulo: "Alertas e e-mails" }]} ativa={aba} onChange={setAba} />
      {aba === "pendencias" ? <Pendencias /> : <Alertas />}
    </>
  );
}

function Pendencias() {
  const navegar = useNavigate();
  const { usuario, nomeUsuario, cad } = useApp();
  const { dados, carregando } = useConsulta(() => api.listarAcoes(), []);
  const [soMinhas, setSoMinhas] = useState(usuario.perfil !== "Administrador");
  const [nivel, setNivel] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const lista = (dados ?? []).filter((a) => (!soMinhas || a.responsavelId === usuario.id) && (!nivel || a.prioridade === nivel) && (!responsavel || a.responsavelId === responsavel));
  const contagem = NIVEIS.map((n) => ({ n, q: (dados ?? []).filter((a) => a.prioridade === n && (!soMinhas || a.responsavelId === usuario.id)).length }));

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {contagem.map(({ n, q }) => (
          <button key={n} onClick={() => setNivel(nivel === n ? "" : n)} className={`rounded-[var(--radius-cartao)] border bg-superficie p-3 text-left ${nivel === n ? "border-primaria-500 ring-2 ring-primaria-100" : "border-borda"}`}>
            <PrioridadeBadge prioridade={n} />
            <p className="mt-2 text-2xl font-semibold tabular">{q}</p>
          </button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-end gap-4 border-b border-borda p-4">
          <Toggle rotulo="Somente minhas ações" checked={soMinhas} onChange={setSoMinhas} />
          <Select className="w-56" rotulo="Responsável" vazio="Todos" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} opcoes={cad.usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
        </div>
        <Tabela<AcaoNecessaria>
          carregando={carregando && !dados}
          linhas={lista}
          chave={(a) => a.id}
          onLinha={(a) => navegar(a.link)}
          vazio="Nenhuma ação pendente para os filtros selecionados."
          colunas={[
            { id: "p", titulo: "Prioridade", largura: "150px", render: (a) => <PrioridadeBadge prioridade={a.prioridade} /> },
            { id: "c", titulo: "Contrato / processo", largura: "150px", render: (a) => <span className="font-semibold text-primaria-800">{a.referencia.codigo}</span> },
            { id: "a", titulo: "Ação", render: (a) => a.acao },
            { id: "r", titulo: "Responsável", render: (a) => nomeUsuario(a.responsavelId) },
            {
              id: "z",
              titulo: "Prazo",
              render: (a) => {
                if (!a.prazo) return "—";
                const d = diffDias(hoje(), a.prazo);
                return (
                  <span className="tabular">
                    {formatarData(a.prazo)}
                    <span className={`block text-[11px] ${d < 0 ? "text-critico-600" : d <= 15 ? "text-acao-600" : "text-texto-fraco"}`}>{d < 0 ? `vencido há ${-d} dias` : `em ${d} dias`}</span>
                  </span>
                );
              },
            },
            { id: "l", titulo: "", alinhamento: "direita", render: (a) => <Link to={a.link} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs font-medium text-primaria-700">Atuar <ExternalLink size={12} /></Link> },
          ]}
        />
      </Card>
    </>
  );
}

function Alertas() {
  const { nomeUsuario, fornecedor, cad } = useApp();
  const { dados: alertas } = useConsulta(() => api.listarAlertas(), []);
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<EmailRenderizado>();
  const porId = useMemo(() => new Map((contratos ?? []).map((c) => [c.contrato_id, c])), [contratos]);
  const ref = hoje();
  // Janela de 120 dias em torno de hoje para manter a lista objetiva.
  const lista = (alertas ?? [])
    .filter((a) => Math.abs(diffDias(ref, a.dataPrevista)) <= 120 && (!status || a.status === status))
    .sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));

  const abrirPreview = (a: Alerta, c: Contrato) => {
    const limite = dataLimiteManifestacao(c.vigencia);
    setPreview(
      renderizarEmailAvaliacao({
        tipo: a.tipo,
        codigo: c.codigo,
        fornecedor: fornecedor(c.fornecedorId)?.razaoSocial ?? "",
        objeto: c.objeto,
        vigenciaInicio: c.vigencia.dataInicio,
        vigenciaFim: c.vigencia.dataFim,
        valorAnual: valorAnualBRL(c.condicoes) ?? c.condicoes.valorAnual,
        moeda: valorAnualBRL(c.condicoes) !== undefined ? "BRL" : c.condicoes.moeda,
        renovacaoAutomatica: c.vigencia.renovacaoAutomatica,
        dataLimite: limite,
        prazoResposta: limite,
        destinatario: nomeUsuario(c.gestorId),
        linkAvaliacao: `${window.location.origin}/contratos/${c.contrato_id}/avaliacao`,
      }),
    );
  };

  return (
    <div className="space-y-4">
      <Aviso tom="info" titulo="Alertas simulados no MVP">
        Canal principal: e-mail ({cad.config.regrasAlerta.canalEmail ? "ativo" : "desativado"}), com cópia no sistema. Destinatários: gestor + Suprimentos. Nenhum e-mail é enviado nesta versão — use “Ver e-mail” para conferir o modelo.
      </Aviso>
      <Card>
        <CardHeader titulo="Linha do tempo de alertas" subtitulo="120 dias antes e depois de hoje" acoes={<Select rotulo="" className="w-44" vazio="Todos os status" value={status} onChange={(e) => setStatus(e.target.value)} opcoes={["Programado", "Enviado", "Interrompido"].map((s) => ({ valor: s, rotulo: s }))} />} />
        <Tabela<Alerta>
          densa
          linhas={lista}
          chave={(a) => a.id}
          vazio="Nenhum alerta na janela."
          colunas={[
            { id: "d", titulo: "Data", largura: "100px", render: (a) => <span className="tabular">{formatarData(a.dataPrevista)}</span> },
            { id: "c", titulo: "Contrato", render: (a) => { const c = porId.get(a.contrato_id); return c ? <Link to={`/contratos/${c.contrato_id}?aba=Vigência`} className="font-semibold text-primaria-800 hover:underline">{c.codigo}</Link> : "—"; } },
            { id: "f", titulo: "Fornecedor", render: (a) => fornecedor(porId.get(a.contrato_id)?.fornecedorId)?.nomeFantasia ?? "—" },
            { id: "t", titulo: "Evento", render: (a) => (a.tipo === "Renovação automática em risco" ? <RiscoRenovacaoBadge /> : a.tipo) },
            { id: "cat", titulo: "Categoria", render: (a) => <span className="text-xs text-texto-suave">{a.categoria}</span> },
            { id: "dest", titulo: "Destinatários", render: (a) => <span className="text-xs">{a.destinatarios.map(nomeUsuario).join(", ")}</span> },
            { id: "s", titulo: "Status", render: (a) => <span title={a.motivoInterrupcao}><Badge tom={a.status === "Enviado" ? "info" : a.status === "Interrompido" ? "alerta" : "neutro"}>{a.status}</Badge></span> },
            { id: "e", titulo: "", alinhamento: "direita", render: (a) => { const c = porId.get(a.contrato_id); return c ? <Button variante="fantasma" tamanho="sm" icone={<Mail size={14} />} onClick={() => abrirPreview(a, c)}>Ver e-mail</Button> : null; } },
          ]}
        />
      </Card>
      <Modal aberto={Boolean(preview)} titulo="Pré-visualização do e-mail" largura="lg" onFechar={() => setPreview(undefined)}>
        {preview && (
          <CardBody className="space-y-3 p-0">
            <p className="text-sm"><span className="text-texto-suave">Assunto:</span> <b>{preview.assunto}</b></p>
            <iframe title="E-mail" srcDoc={preview.html} sandbox="" className="h-[460px] w-full rounded border border-borda bg-white" />
          </CardBody>
        )}
      </Modal>
    </div>
  );
}
