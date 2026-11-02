# Implantação — correção, revisão e envio por e-mail

A planilha mestre **não precisa ter Apps Script vinculado**. O repositório tem dois projetos Apps Script independentes: backend de entregas e painel administrativo. Os arquivos deste PR ainda **não estão executando no ambiente publicado**.

## 1. Backend de entregas
No Apps Script já implantado para receber as entregas (código correspondente a \`backend/Code.gs\`), adicionar o arquivo \`backend/CorrecaoIA.gs\`. Configurar a propriedade privada de script \`GEMINI_API_KEY\`; não publicar chave no repositório. Executar \`processarCorrecoesIA\` manualmente, conferir o registro de teste e depois executar \`instalarAgendamentoCorrecoes\` para criar gatilho a cada 5 minutos. O motor registra as avaliações com status \`PENDENTE_APROVACAO\`.

## 2. Painel do professor
No OUTRO projeto Apps Script correspondente a \`backend-admin/Code.gs\` e \`backend-admin/Admin.html\`:
- Adicionar \`backend-admin/CorrecoesProfessor.gs\`.
- Substituir o HTML \`Admin\` pelo arquivo \`backend-admin/Admin.html\` desta revisão.
- Adicionar nas **propriedades de script** \`PROFESSOR_EMAIL\` com o e-mail da conta Google do professor, conforme mostrado por \`Session.getActiveUser().getEmail()\`.
- Configurar a implantação do aplicativo web para acesso **somente da conta autorizada**. Não disponibilizar o painel como **Qualquer pessoa**, especialmente se a implantação executa com privilégios do proprietário.
- Implantar nova versão do aplicativo web. Validar autenticação e autorização antes de uso real.

## Fluxo
1. IA avalia e grava \`PENDENTE_APROVACAO\`.
2. Na aba **Correções IA**, o professor vê resposta/arquivos, menção e justificativa.
3. Pode editar a menção e justificativa, clicar **Salvar revisão** (status \`EM_REVISAO\`) e **Aprovar** (status \`APROVADA\`).
4. Só em \`APROVADA\` o botão **Enviar por e-mail** fica habilitado. Uma confirmação explícita é exibida.
5. O Apps Script usa \`MailApp\` para enviar cópias individuais aos e-mails da entrega, registra os destinatários no JSON, marca \`ENVIADA\` e a data \`ENVIADO_EM\`.
6. Em falha parcial, fica \`ENVIO_PARCIAL\`: nova tentativa ignora os destinatários já registrados.

## Atenção
- Nenhum e-mail é enviado pelo simples fato de executar a correção ou aprová-la.
- Confirme os endereços cadastrados, a qualidade das avaliações e o limite/custo da API.
- Uma menção já enviada não pode ser editada por esta interface.
- Respostas em arquivos Word e Excel exigem conversão, conforme o arquivo \`backend/CORRECAO_IA_SETUP.md\`.
- Se \`PROFESSOR_EMAIL\` estiver ausente ou o Apps Script não reconhecer a conta, todas as ações de revisão e envio serão recusadas.
- Os endpoints públicos para alunos devem permanecer separados do painel administrativo. **Não juntar os arquivos de revisão no backend público.**
- Esta revisão foi preparada no repositório; a implantação e a execução real ainda precisam ser testadas em cada Apps Script.
