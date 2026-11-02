# Correção automática por IA — 3º TANE

## Implantação
O GitHub Pages é uma interface estática: **o arquivo `backend/CorrecaoIA.gs` no repositório não é executado automaticamente**. A rotina precisa ser copiada como um arquivo adicional para o **projeto Apps Script independente que já executa `backend/Code.gs`**. Não copiar o arquivo para dentro da planilha, salvo se esse for o projeto implantado para receber as entregas.

1. Abrir o projeto Apps Script responsável pelo endpoint atual de envio. Conferir que há as funções `ss_()`, `sh_()` e `rows_()` de `backend/Code.gs`.
2. Criar nele um arquivo `CorrecaoIA.gs` com o conteúdo de `backend/CorrecaoIA.gs`.
3. Em **Configurações do projeto > Propriedades do script**, cadastrar `GEMINI_API_KEY` com uma chave válida do Gemini, com API e faturamento/limites habilitados conforme o plano. **Nunca colocar a chave no GitHub ou no HTML público.**
4. Executar manualmente `processarCorrecoesIA` uma vez, aprovar permissões e verificar os registros na aba `CORRECOES_IA`. Somente depois executar `instalarAgendamentoCorrecoes`.
5. Conferir o resultado e os custos de utilização da API antes de liberar lotes maiores. Cada execução processa até cinco novas entregas, incluindo erros.
6. Os resultados permanecem em `PENDENTE_APROVACAO`. Esta versão **não publica nem envia avaliações aos alunos**.

## Regras e limitações
- Somente atividades com `CORRECAO_IA = SIM` **e gabarito não vazio** são avaliadas.
- `ADMP_AULA10` é relacionado a `ATD2_ADMP` apenas para localizar o gabarito; a entrega original não é modificada.
- O código evita duplicidade por `ID_ENTREGA`.
- Entradas em texto, imagens PNG/JPEG/WebP, PDFs e Google Docs são aceitas. Arquivos Word/Excel não são avaliados automaticamente; precisam de conversão adequada. OCR/leitura multimodal depende das capacidades e limites do modelo Gemini.
- A atividade `CI_ATD4` está marcada para correção, mas não possui gabarito: fica ignorada até o professor cadastrar critérios.
- Registros com erro são mantidos para auditoria; `liberarTentativaDeCorrecao(idEntrega)` só remove o registro de erro para permitir nova tentativa.
- O processamento é assíncrono por gatilho de tempo, não bloqueia o envio e não altera `ENTREGAS`.

## Teste recomendado
Executar com uma entrega de teste e conferir o JSON, a menção MB/B/R/I e as justificativas. Em caso de avaliação duvidosa, corrigir manualmente antes de qualquer publicação.
