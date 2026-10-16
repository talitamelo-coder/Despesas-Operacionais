# Dados fictícios para testar Licenças e Telefonia

Arquivos CSV (padrão Excel pt-BR, separador `;`) com dados **inventados** para conferir a importação
e os critérios de aceite. Use no **modo de demonstração** ou numa base de teste: os fornecedores
"Teste …" entram como pré-cadastro e não devem ir para a base real.

Ordem: Licenças → Importar CSV

1. `1-licencas.csv`: 4 licenças válidas (USD por assento, BRL anual, consumo sem limite, valor fixo),
   1 recusada (anual com vencimento mensal) e 1 linha de TOTAL ignorada.
2. `2-movimentacoes.csv`: compra de +5, redução de 3 (economia) e renegociação de preço (economia).
3. `3-atribuicoes.csv`: pessoas novas, conta compartilhada, 1 linha sem e-mail (fila de conciliação),
   1 e-mail de outro domínio do grupo (reconhecido como a mesma pessoa) e 1 pessoa sem assento livre (recusada).
4. `4-linhas.csv` (em Telefonia → Importar CSV): 3 linhas ativas, 1 cancelada e 1 número inválido.

O que conferir:
- Reimportar qualquer arquivo não muda os totais (tudo aparece como "Já existe").
- No dashboard, a soma das barras de "Ofensores" (top + Demais + Não atribuído + Disponível) fecha com o total.
- Licença em BRL nunca mostra IOF; o cenário com impostos aparece só no indicador separado.
- Com um gestor de Tecnologia, só aparecem pessoas e custos da área dele.
- Alterar spread, IOF ou PTAX em "Câmbio e parâmetros" recalcula o dashboard na hora.
