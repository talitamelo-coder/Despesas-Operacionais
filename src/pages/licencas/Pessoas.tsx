import { useMemo, useState } from "react";
import { ArrowLeft, Pencil, UserMinus, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GradeValores, Input, Select, Valor } from "@/components/ui/Campos";
import { Paginacao, Tabela } from "@/components/ui/Tabela";
import { formatarData, hoje } from "@/domain/datas";
import { formatarMoeda } from "@/domain/formatacao";
import { competenciaDe, parcelasDoPeriodo } from "@/domain/rules/licencas";
import { formatarLinha } from "@/domain/rules/telefonia";
import type { Colaborador } from "@/domain/types";
import { useApp } from "@/app/contexto";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/services";
import { ColaboradorModal, DesligarModal, novoColaborador } from "./formularios";
import type { ContextoLicencas } from "./Licencas";

const TAMANHO = 50;

/** Quem usa licenças e linhas. Separado dos usuários do sistema. Dado pessoal (LGPD). */
export function Pessoas({ ctx }: { ctx: ContextoLicencas }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("Ativo");
  const [pagina, setPagina] = useState(0);
  const [editar, setEditar] = useState<Colaborador>();
  const { dados } = ctx;
  const mes = competenciaDe(hoje());
  // Custo do mês atual por pessoa, pelo mesmo rateio do dashboard.
  const custoMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of parcelasDoPeriodo(dados, mes, mes)) if (p.colaboradorId) m.set(p.colaboradorId, (m.get(p.colaboradorId) ?? 0) + (p.custoRealBRL ?? 0));
    return m;
  }, [dados, mes]);

  const selecionada = ctx.item ? ctx.colaborador(ctx.item) : undefined;
  if (selecionada?.nome) return <FichaPessoa c={selecionada} ctx={ctx} custoMes={custoMes.get(selecionada.id) ?? 0} />;

  const b = busca.trim().toLowerCase();
  const linhas = dados.colaboradores
    .filter((c) => c.nome && (!status || c.status === status) && (!b || `${c.nome} ${c.email} ${c.area ?? ""}`.toLowerCase().includes(b)))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const licencasDe = (id: string) => dados.atribuicoes.filter((a) => a.colaboradorId === id && a.status === "Ativa").length;
  const linhasDe = (id: string) => dados.usosLinha.filter((u) => u.colaboradorId === id && u.status === "Ativa").length;

  return (
    <div className="space-y-4">
    {ctx.podeGerir && <PendenciasAtribuicao ctx={ctx} />}
    <Card>
      <CardHeader
        titulo="Pessoas"
        subtitulo={ctx.areaFixa ? `Pessoas da área ${ctx.areaFixa}` : "Quem usa licenças e linhas. O e-mail corporativo é a identidade (sem duplicar)."}
        acoes={ctx.podeGerir && <Button icone={<UserPlus size={16} />} onClick={() => setEditar(novoColaborador())}>Nova pessoa</Button>}
      />
      <CardBody className="grid grid-cols-1 gap-3 border-b border-borda md:grid-cols-3">
        <Input rotulo="Buscar" placeholder="Nome, e-mail ou área" value={busca} onChange={(e) => (setBusca(e.target.value), setPagina(0))} />
        <Select rotulo="Situação" value={status} vazio="Todas" onChange={(e) => (setStatus(e.target.value), setPagina(0))} opcoes={[{ valor: "Ativo", rotulo: "Ativas" }, { valor: "Desligado", rotulo: "Desligadas" }]} />
      </CardBody>
      <Tabela
        linhas={linhas.slice(pagina * TAMANHO, (pagina + 1) * TAMANHO)}
        chave={(c) => c.id}
        onLinha={(c) => ctx.irPara("pessoas", c.id)}
        vazio="Nenhuma pessoa."
        colunas={[
          { id: "nome", titulo: "Nome", render: (c) => <span className="font-medium">{c.nome}{c.tipoConta === "Compartilhada" && <Badge className="ml-2">Compartilhada</Badge>}{c.status === "Desligado" && <Badge tom="critico" className="ml-2">Desligado</Badge>}</span> },
          { id: "email", titulo: "E-mail", render: (c) => c.email },
          { id: "area", titulo: "Área", render: (c) => c.area ?? "—" },
          { id: "lic", titulo: "Licenças", alinhamento: "direita", render: (c) => licencasDe(c.id) },
          { id: "lin", titulo: "Linhas", alinhamento: "direita", render: (c) => linhasDe(c.id) },
          { id: "custo", titulo: "Custo licenças no mês", alinhamento: "direita", render: (c) => formatarMoeda(custoMes.get(c.id) ?? 0) },
        ]}
      />
      <Paginacao pagina={pagina} total={linhas.length} tamanho={TAMANHO} onPagina={setPagina} />
      {editar && <ColaboradorModal colaborador={editar} ctx={ctx} onFechar={() => setEditar(undefined)} />}
    </Card>
    </div>
  );
}

function FichaPessoa({ c, ctx, custoMes }: { c: Colaborador; ctx: ContextoLicencas; custoMes: number }) {
  const [editar, setEditar] = useState(false);
  const [desligar, setDesligar] = useState(false);
  const { dados } = ctx;
  const lics = dados.atribuicoes.filter((a) => a.colaboradorId === c.id).sort((a, b) => (a.status === b.status ? b.dataInicio.localeCompare(a.dataInicio) : a.status === "Ativa" ? -1 : 1));
  const usos = dados.usosLinha.filter((u) => u.colaboradorId === c.id);
  const linha = (id: string) => dados.linhas.find((l) => l.id === id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="inline-flex items-center gap-1 text-sm text-primaria-800 hover:underline" onClick={() => ctx.irPara("pessoas")}><ArrowLeft size={14} /> Todas as pessoas</button>
        {ctx.podeGerir && (
          <div className="flex gap-2">
            <Button variante="secundario" icone={<Pencil size={14} />} onClick={() => setEditar(true)}>Editar</Button>
            {c.status === "Ativo" && <Button variante="perigo" icone={<UserMinus size={14} />} onClick={() => setDesligar(true)}>Desligar</Button>}
          </div>
        )}
      </div>
      <Card>
        <CardHeader titulo={<span className="flex items-center gap-2">{c.nome}<Badge tom={c.status === "Ativo" ? "sucesso" : "critico"}>{c.status}</Badge></span>} subtitulo={c.email} />
        <CardBody>
          <GradeValores colunas={4}>
            <Valor rotulo="Área">{c.area ?? "—"}</Valor>
            <Valor rotulo="Centro de custo">{c.centroCusto ?? "—"}</Valor>
            <Valor rotulo="Tipo de conta">{c.tipoConta}{c.responsavelId && <span className="block text-xs text-texto-suave">Responsável: {ctx.nomeColaborador(c.responsavelId)}</span>}</Valor>
            <Valor rotulo="Custo de licenças no mês" origem="calculado">{formatarMoeda(custoMes)}</Valor>
            {c.dataDesligamento && <Valor rotulo="Desligamento">{formatarData(c.dataDesligamento)}</Valor>}
          </GradeValores>
        </CardBody>
      </Card>
      <Card>
        <CardHeader titulo="Licenças" subtitulo="Atuais e histórico" />
        <Tabela
          densa
          linhas={lics}
          chave={(a) => a.id}
          onLinha={(a) => ctx.irPara("licencas", a.licencaId)}
          vazio="Nenhuma licença."
          colunas={[
            { id: "lic", titulo: "Licença", render: (a) => <span className="font-medium">{ctx.licenca(a.licencaId)?.produto} <span className="text-xs text-texto-suave">{ctx.licenca(a.licencaId)?.plano}</span></span> },
            { id: "forn", titulo: "Fornecedor", render: (a) => ctx.nomeFornecedor(ctx.licenca(a.licencaId)?.fornecedorId) },
            { id: "ini", titulo: "Início", render: (a) => formatarData(a.dataInicio) },
            { id: "fim", titulo: "Fim", render: (a) => (a.dataFim ? formatarData(a.dataFim) : "—") },
            { id: "st", titulo: "Situação", render: (a) => <Badge tom={a.status === "Ativa" ? "sucesso" : "neutro"}>{a.status}</Badge> },
          ]}
        />
      </Card>
      <Card>
        <CardHeader titulo="Linhas telefônicas" subtitulo="Controladas no menu Telefonia" />
        <Tabela
          densa
          linhas={usos}
          chave={(u) => u.id}
          vazio="Nenhuma linha."
          colunas={[
            { id: "num", titulo: "Número", render: (u) => formatarLinha(linha(u.linhaId)?.numero ?? "") },
            { id: "op", titulo: "Operadora", render: (u) => linha(u.linhaId)?.operadora },
            { id: "valor", titulo: "Valor mensal", alinhamento: "direita", render: (u) => formatarMoeda(linha(u.linhaId)?.valorMensal) },
            { id: "ini", titulo: "Início", render: (u) => formatarData(u.dataInicio) },
            { id: "st", titulo: "Situação", render: (u) => <Badge tom={u.status === "Ativa" ? "sucesso" : "neutro"}>{u.status}</Badge> },
          ]}
        />
      </Card>
      {editar && <ColaboradorModal colaborador={c} ctx={ctx} onFechar={() => setEditar(false)} />}
      {desligar && <DesligarModal colaborador={c} ctx={ctx} onFechar={() => setDesligar(false)} />}
    </div>
  );
}

/** Usuários que a importação não conseguiu atribuir (sem e-mail ou sem assento livre). Ficam até resolver ou descartar. */
function PendenciasAtribuicao({ ctx }: { ctx: ContextoLicencas }) {
  const { usuario, executar } = useApp();
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [descartar, setDescartar] = useState<{ id: string; motivo: string }>();
  const abertas = (ctx.dados.pendencias ?? []).filter((p) => p.status === "Aberta");
  if (!abertas.length) return null;
  const licenca = (id: string) => ctx.dados.licencas.find((l) => l.id === id);
  const rotulo = (id: string) => { const l = licenca(id); return l ? `${ctx.nomeFornecedor(l.fornecedorId)} · ${l.produto}${l.plano ? ` ${l.plano}` : ""}` : "—"; };
  const semEmail = abertas.filter((p) => p.motivo === "Sem e-mail").length;
  return (
    <Card>
      <CardHeader
        titulo={`Pendências de atribuição (${abertas.length})`}
        subtitulo={`Vindas da importação: ${semEmail} sem e-mail, ${abertas.length - semEmail} sem assento livre. Informe o e-mail ou registre a compra do assento na licença e clique em Atribuir.`}
      />
      <Tabela
        densa
        linhas={abertas}
        chave={(p) => p.id}
        colunas={[
          { id: "n", titulo: "Pessoa", render: (p) => <span className="font-medium">{p.nome}{p.area && <span className="block text-xs font-normal text-texto-suave">{p.area}</span>}</span> },
          { id: "l", titulo: "Licença", render: (p) => <span className="text-sm">{rotulo(p.licencaId)}</span> },
          { id: "m", titulo: "Motivo", render: (p) => <Badge tom={p.motivo === "Sem e-mail" ? "alerta" : "critico"}>{p.motivo}</Badge> },
          {
            id: "e",
            titulo: "E-mail",
            render: (p) => (p.email ? <span className="text-sm">{p.email}</span> : <Input rotulo="" aria-label={`E-mail de ${p.nome}`} placeholder="nome@empresa.com.br" value={emails[p.id] ?? ""} onChange={(e) => setEmails({ ...emails, [p.id]: e.target.value })} />),
          },
          {
            id: "a",
            titulo: "",
            alinhamento: "direita",
            render: (p) => (
              <span className="flex justify-end gap-1">
                <Button tamanho="sm" disabled={!p.email && !emails[p.id]?.trim()} onClick={() => executar(() => api.resolverPendenciaAtribuicao(p.id, p.email ? undefined : emails[p.id], usuario.id), "Licença atribuída.")}>Atribuir</Button>
                <Button tamanho="sm" variante="fantasma" onClick={() => setDescartar({ id: p.id, motivo: "" })}>Descartar</Button>
              </span>
            ),
          },
        ]}
      />
      <Modal aberto={Boolean(descartar)} titulo="Descartar pendência" onFechar={() => setDescartar(undefined)} rodape={<><Button variante="secundario" onClick={() => setDescartar(undefined)}>Cancelar</Button><Button disabled={!descartar?.motivo.trim()} onClick={async () => descartar && (await executar(async () => (await api.descartarPendenciaAtribuicao(descartar.id, descartar.motivo, usuario.id), true), "Pendência descartada.")) && setDescartar(undefined)}>Descartar</Button></>}>
        <Input rotulo="Motivo" obrigatorio placeholder="Ex.: pessoa desligada, conta duplicada" value={descartar?.motivo ?? ""} onChange={(e) => descartar && setDescartar({ ...descartar, motivo: e.target.value })} />
        <p className="mt-2 text-xs text-texto-suave">A pendência sai da fila, mas fica registrada na auditoria.</p>
      </Modal>
    </Card>
  );
}
