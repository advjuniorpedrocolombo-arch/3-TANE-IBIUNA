# Backend PTCC — Marketing 2026 — Ibiúna

Backend em Google Apps Script para a plataforma PTCC.

## Já preparado

- Recebimento do Termo de Compromisso em PDF
- Protocolo automático `PTCC-2026-TERMO-00001`
- Validação manual do professor
- Criação automática do grupo `G01`, `G02`...
- Criação automática das pastas de cada etapa no Google Drive
- Geração automática de senha do grupo
- Senha armazenada somente como hash + salt
- Envio da senha inicial por e-mail ao representante e ao vice
- Login por grupo + senha
- Sessão temporária
- Bloqueio após tentativas inválidas
- Recuperação automática de senha por código temporário
- Área do grupo via API (`dashboard`)
- Envio das etapas em PDF com versionamento V01, V02, V03...
- Protocolo por envio
- Aprovação e solicitação de reenvio pelo professor
- Histórico em `LOG_ADMIN`

## Planilha central

`CONTROLE PTCC - Marketing 2026 - Ibiúna`

ID: `1uVrwJGkExmTkpoEAoMGTQ73z5zlK45xDvZ3sNRyBb3A`

## Implantação

1. Criar um projeto em https://script.google.com
2. Substituir o conteúdo de `Code.gs` pelo arquivo `Code.gs` desta pasta.
3. Em Configurações do projeto, habilitar a exibição do arquivo de manifesto e substituir `appsscript.json` pelo manifesto desta pasta.
4. Executar a função `setupInicial()` uma vez e autorizar Drive, Sheets e envio de e-mail.
5. Implantar como **Aplicativo da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Copiar a URL terminada em `/exec`.
7. Informar essa URL no chat para conexão com a página GitHub Pages.

## Validação inicial de grupos

Enquanto o painel administrativo visual não estiver conectado, o professor pode usar no editor do Apps Script:

```javascript
validarTermoPorProtocolo('PTCC-2026-TERMO-00001')
```

Para solicitar regularização:

```javascript
solicitarRegularizacaoTermo('PTCC-2026-TERMO-00001', 'Motivo da regularização')
```

Depois da conexão do frontend, essas ações serão disponibilizadas no painel administrativo e não precisarão ser executadas manualmente.
