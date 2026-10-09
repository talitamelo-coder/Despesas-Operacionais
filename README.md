# Gestão de Contratos · Akross Atende

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
3. **Contratos atuais:** Administração → Importação da planilha (planilha salva como CSV). O relatório aponta inconsistências, registros incompletos e duplicidades antes de importar. Gestores citados na planilha e ainda não cadastrados são criados automaticamente.
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

## Cenários de demonstração

| Cenário | Onde ver |
|---|---|
| Contrato vigente normal | Prisma Facilities (limpeza predial) |
| Renovação em andamento, com cadeia de 3 contratos | LinkSul: dois contratos encerrados → vigente → processo de renovação em negociação |
| Renovação automática em risco | Vértice Segurança (vigilância 24x7) |
| Troca de fornecedor com saving composto | Brisa → Eixo Engenharia (R$ 350 mil: troca de fornecedor + negociação + escopo) |
| Contrato em análise jurídica | CRM Orbital, vindo do JIRA COMP-1244 |
| Contrato encerrado | Pixel Gráfica |
| Moeda estrangeira (USD, PTAX) | Global Seat Licensing |
| Reajuste evitado (baseline ajustado) | DataForte: R$ 1,0 mi + 5% → saving de R$ 50 mil |
| Demanda JIRA aguardando validação | URA/discador, COMP-1287 |
| Aditivo aguardando aprovação comercial | Nexo Contact Center |

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
5. **Ciência do diretor** não bloqueia o envio ao Jurídico. Só as aprovações (Gestor, Suprimentos e Diretor em exceção) bloqueiam.
6. **Assinatura** só começa depois do parecer jurídico emitido (com ou sem ressalvas).
7. **Aditivo concluído** altera o próprio contrato (mesmo código), com auditoria do valor anterior e do novo. **Renovação e substituição** sempre geram um código novo, vinculado ao anterior.
8. A **resposta do gestor** à avaliação cria automaticamente o processo de renovação ou substituição para Suprimentos.
9. **Importação** aceita CSV (a planilha exportada como CSV). A leitura direta de `.xlsx` fica para uma próxima entrega.
10. **Documentos.** No MVP só os metadados e as versões são registrados. O arquivo não é armazenado.
11. **Dados bancários e PIX do fornecedor** são cadastrados neste módulo a pedido do negócio, ao contrário do briefing original. Ficam mascarados nas consultas e na auditoria. A fonte oficial para pagamento continua sendo o sistema atual.

## Fora do escopo do MVP (conforme briefing)

Contas a pagar, notas fiscais, ERP, portal de fornecedor, OCR, IA jurídica, assinatura eletrônica própria, RFQ/RFP completo, supplier risk e integrações reais com JIRA, Adobe ou o sistema atual. A arquitetura já reserva os pontos de integração em `src/integrations/` e `src/services/rest/`.
