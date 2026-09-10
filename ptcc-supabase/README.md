# PTCC — Supabase v2

Nova versão da plataforma PTCC, construída sem alterar a versão original em `/ptcc`.

## Arquitetura
- GitHub Pages: frontend
- Supabase Postgres: dados acadêmicos, grupos, etapas, entregas, feedbacks e histórico
- Supabase Auth: acesso individual de alunos e professor
- Supabase Storage: PDFs privados (10 MB, somente application/pdf)
- RLS: isolamento dos dados por grupo e perfil de professor

## Páginas
- `index.html`: página pública + Termo de Compromisso + acesso do grupo
- `professor.html`: painel administrativo

## Fluxo
1. Equipe envia Termo e recebe protocolo.
2. Professor valida a solicitação no painel administrativo.
3. Banco cria código G01/G02..., projeto e etapas do grupo.
4. Integrantes criam acesso com o mesmo e-mail informado no Termo.
5. Grupo envia etapas em PDF; cada envio recebe protocolo e versão.
6. Professor aprova ou solicita ajustes.
7. Grupo acompanha status, progresso, versões e devolutivas.

A chave presente no frontend é a chave **publishable** do Supabase, adequada a aplicações públicas. A proteção dos dados é feita pelas políticas RLS no banco.