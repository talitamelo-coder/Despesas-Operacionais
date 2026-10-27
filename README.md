# Gestão de Contratos · Akross

Módulo de Gestão de Contratos de uma empresa de médio porte, que substitui o controle em planilha. Toma como referência as boas práticas do SAP Ariba Contracts, em versão bem mais simples, e foi pensado como **extensão nativa da plataforma Akross Atende**.

Esta é a **primeira entrega (MVP de front-end)**: as 9 telas com navegação completa, as regras de negócio centralizadas e testadas, dados de demonstração coerentes e a arquitetura pronta para trocar o mock pela API (Backend Python + MySQL), sem reescrever a interface.

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # regras de negócio e fluxos ponta a ponta
npm run build      # typecheck + build de produção em dist/
```

Os dados ficam no navegador (localStorage). Para recriar a demonstração: **Administração → Dados e backup**. Para testar os perfis, use o seletor **Perfil simulado** no topo (Suprimentos, Gestor, Jurídico, Administrador, Diretor).

## Usar com dados reais (fase de teste)

1. **Administração → Dados e backup → Começar base vazia.** Remove os dados fictícios e cria você como primeiro Administrador.
2. **Cadastros:** Empresas, Usuários (gestores, analistas de Suprimentos, Jurídico, diretores) e Fornecedores.
3. **Contratos atuais:** Administração → Importação da planilha → **Baixar modelo Excel**. O modelo (.xlsx) traz as colunas da carga, listas suspensas com os cadastros (empresas, gestores, analistas, tipos, moedas, unidades, periodicidades, índices) e uma aba de instruções. Preencha um contrato por linha e suba o próprio .xlsx (CSV também é aceito). O relatório aponta inconsistências, registros incompletos e duplicidades antes de gravar; reimportar não duplica. Gestores citados na planilha e ainda não cadastrados são criados automaticamente. Linhas sem datas, valor ou gestor entram como **“A completar”** (pendências na Central; edição liberada até completar) e linhas sem empresa usam a empresa padrão escolhida na importação; coluna opcional **Valor mensal** (anual = mensal × 12). A planilha pode trazer uma aba **Fornecedores** (endereço, dados bancários…): na carga, fornecedor novo é cadastrado e o já existente (mesmo CNPJ) só é completado, sem sobrescrever nada; regras em `rules/importacaoFornecedores.ts`. Leitura e geração de .xlsx sem biblioteca externa (`src/app/xlsx.ts`); o formato .xls antigo não é lido (salve como .xlsx).
4. **Novas contratações:** Novo Processo. Sem a integração com o JIRA, o número do chamado é registrado e os dados são preenchidos manualmente.
5. **Cópia de segurança:** Administração → Dados e backup → Salvar cópia de segurança, ao fim de cada sessão de uso.

Limites desta fase: os dados ficam **só no navegador e no computador** de quem usa (não são compartilhados com a equipe), não há login (o "Perfil simulado" só serve para testar as permissões) e os anexos guardam apenas o nome do arquivo. O uso por várias pessoas, com segurança, depende do backend com banco de dados (ver `docs/arquitetura.md`).

## Stack

React 19 + TypeScript + Vite + Tailwind CSS 4, a mesma base que o Lovable gera. O repositório pode ser importado no Lovable para os ajustes incrementais. Gráficos com Recharts e ícones com Lucide.

## Telas

| # | Tela | Rota |
|---|---|---|
| 1 | Dashboard | `/` |
| 2 | Central de Contratos | `/contratos` |
| 3 | Novo Processo (assistente) | `/processos/novo` |
| 4 | Processo de Contratação | `/processos/:id` |
| 5 | Capa do Contrato (8 abas) | `/contratos/:id` |
| 6 | Avaliação de Renovação | `/contratos/:id/avaliacao` |
| 7 | Documentos | `/documentos` |
| 8 | Ações Necessárias (pendências, alertas e prévia de e-mail) | `/acoes` |
| 9 | Administração (inclui a importação da planilha) | `/admin` |
| 10 | Contratos de clientes (painel, contratos, clientes, importação) | `/clientes` |

Navegação pelo **menu no topo** (no celular e em telas estreitas, vira menu recolhível).

### Fora deste módulo

**Licenças de software e linhas telefônicas** passam a ser controladas no módulo de gestão. As telas saíram daqui e elas não consomem mais o saldo do contrato. As regras e a API simulada (`domain/rules/licencas.ts`, `telefonia.ts`) continuam no repositório como referência para o novo módulo; os dados já gravados no navegador não foram apagados. Orçamento, valor pago e classificação contábil também ficam em outro módulo.

### Papel do módulo de contratos

Três funções: **registro do contrato, saldo e valores contratados**. Pedidos, Contas a pagar e Contas a receber fazem o resto, respeitando o que foi contratado. Depois da contratação, valor e prazo só mudam por **aditivo** (inclusive renegociação) ou novo contrato: a edição direta fica liberada apenas para completar cadastro importado.

### Contratos de clientes

Menu **Contratos de clientes**, com cadastro de **clientes separado** do de fornecedores (cliente no exterior sem CNPJ). Registra cliente, vigência (ou prazo indeterminado com revisão anual), tipo de receita (fixa, variável ou fixa + variável), valores previstos no contrato (ex.: "a partir de 11/2026, R$ X/mês"), contrato principal (receita apurada em outro contrato) e renovação/substituição de um ou mais contratos. O **saldo a faturar** é consumido pelas notas emitidas que chegam do Contas a receber (porta de integração pronta; nada de faturamento é feito aqui). A Central de Contratos e o Dashboard ficam com os contratos de fornecedores.

Aba **Painel**: receita mensal contratada (fixa e variável estimada), receita anualizada, receita em risco (vencidos ou vencendo em até 90 dias), renovação automática/indeterminado, concentração no maior cliente, receita por cliente, por faixa de vencimento, por tipo e por gestor, lista por vencimento (exporta CSV) e alertas (vencido sem novo contrato, vencendo, revisão anual atrasada, saldo a faturar ≥ 80%, concentração > 50%, cadastro a completar). Regras em `rules/painelClientes.ts`.

Aba **Importar**: CSV de contratos de clientes (modelo para download, prévia linha a linha, idempotente). Gestor precisa existir com perfil Gestor; cliente inexistente é cadastrado; sem data de início, o contrato entra com pendência. Arquivo fictício em `ferramentas/dados-teste-clientes/`.

### Saldo do contrato

O saldo fica **no contrato** (não no fornecedor): contratado (valor anual × duração da vigência + saldo adicionado) − pedidos aprovados e pagos. **Pedido acima do saldo é bloqueado**: é preciso "Adicionar saldo" (ex.: aditivo de valor). Alertas aos 80% e 100%. Até a integração com o módulo de pedidos, os pedidos são registrados na capa do contrato.

### Contratos: vigência e cancelamento

- Todo contrato precisa de vigência. **Prazo indeterminado** tem revisão anual (aniversário da data de início ou data-base), com os mesmos alertas da renovação.
- Na avaliação, **não renovar nem substituir passa o contrato para Cancelado**. Se houver renovação automática, Suprimentos recebe a ação de comunicar o fornecedor antes da data limite.
- A capa mostra **valor mensal e anual**.

## Cenários de demonstração

| Cenário | Onde ver |
|---|---|
| Contrato vigente normal | Prisma Facilities (limpeza predial) |
| Renovação em andamento, com cadeia de 3 contratos | LinkSul: dois contratos encerrados → vigente → processo de renovação com Suprimentos |
| Renovação automática em risco | Vértice Segurança (vigilância 24x7) |
| Troca de fornecedor com saving composto | Brisa → Eixo Engenharia (R$ 350 mil: troca de fornecedor + negociação + escopo) |
| Aguardando assinatura (aprovado no JIRA) | CRM Orbital, vindo do JIRA COMP-1244 |
| Contrato encerrado | Pixel Gráfica |
| Moeda estrangeira (USD, PTAX) | Global Seat Licensing |
| Reajuste evitado (baseline ajustado) | DataForte: R$ 1,0 mi + 5% → saving de R$ 50 mil |
| Demanda JIRA recém-chegada, com Suprimentos | URA/discador, COMP-1287 |
| Aditivo pronto para assinatura | Nexo Contact Center |

Há também cerca de 140 contratos de fundo para testar volume, filtros e ordenação. Todos os nomes, CNPJs e valores são **fictícios**.

## Estrutura

```
src/
  domain/            tipos, regras centralizadas (rules/) e templates de e-mail
  integrations/      gateways JIRA, Adobe e sistema atual (interfaces + simulação)
  services/          contrato da camada de dados (api.ts), mock e esboço REST
  components/ui/     componentes visuais reutilizáveis
  components/dominio componentes de negócio (saving, documentos, auditoria)
  pages/             as 9 telas
docs/
  arquitetura.md     camadas, desempenho, incorporação à Akross Atende, FinOps
  api-contrato.md    endpoints REST equivalentes à interface ContratosApi
  modelo-dados.sql   proposta de schema MySQL
```

## Premissas adotadas (validar com o negócio)

1. **Identidade visual.** Não tive acesso ao design system da Akross Atende. A paleta, o raio e a tipografia são **provisórios** e estão centralizados em `src/styles/index.css`. Para alinhar, basta substituir os tokens; os componentes não precisam mudar.
2. **"Renovação automática em risco"** aparece quando faltam **30 dias ou menos para a data limite de manifestação** e o ciclo não foi resolvido formalmente. O prazo é configurável em Administração → Regras de alertas.
3. **"Data limite próxima"** corresponde aos últimos **15 dias** antes da data limite.
4. **Lembrete de 60 dias.** Com o prazo padrão do gestor (30 dias), ele cai *antes* da abertura da avaliação, porque segue literalmente "60 dias restantes para a data limite". Confirmar se a intenção era essa ou "60 dias para o fim".
5. **Fluxo do processo**: Rascunho → Com Suprimentos → Aguardando assinatura → Concluído, para todos os tipos. A aprovação comercial é feita no JIRA e o jurídico está fora do fluxo; as duas etapas podem ser religadas em Administração → Processo de contratação. Ligadas, a ciência do diretor não bloqueia e a assinatura só começa depois do parecer jurídico.
6. **Gestor** não é obrigatório para abrir o processo (os gestores ainda não estão no sistema). Contrato gerado sem gestor entra com a pendência "Gestor".
7. **Aditivo concluído** altera o próprio contrato (mesmo código), com auditoria do valor anterior e do novo. **Renegociação** não é mais um tipo separado: é um Aditivo com tipo "Renegociação" (preço, condições, reajuste). **Renovação e substituição** sempre geram um código novo, vinculado ao anterior.
8. A **resposta do gestor** à avaliação cria automaticamente o processo de renovação ou substituição para Suprimentos.
9. **Importação** aceita CSV (a planilha exportada como CSV). A leitura direta de `.xlsx` fica para uma próxima entrega.
10. **Documentos.** No MVP só os metadados e as versões são registrados. O arquivo não é armazenado.
11. **Dados bancários e PIX do fornecedor** são cadastrados neste módulo a pedido do negócio, ao contrário do briefing original. Ficam mascarados nas consultas e na auditoria. A fonte oficial para pagamento continua sendo o sistema atual.

## Fora do escopo do MVP (conforme briefing)

Contas a pagar, notas fiscais, ERP, portal de fornecedor, OCR, IA jurídica, assinatura eletrônica própria, RFQ/RFP completo, supplier risk e integrações reais com JIRA, Adobe ou o sistema atual. A arquitetura já reserva os pontos de integração em `src/integrations/` e `src/services/rest/`.
