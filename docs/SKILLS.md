# Avaliação de skills (2026-11-06)

## Já disponíveis nesta conta e úteis para a AI Office
| Skill | Uso previsto |
|---|---|
| `anthropic-skills:deep-research` | Estratégia & Inteligência: pesquisas multi-fonte com relatório |
| `anthropic-skills:xlsx` | Finanças: orçamentos, projeções, runway em planilha |
| `anthropic-skills:pdf` / `docx` / `pptx` | Documentos administrativos, propostas, pitch |
| `anthropic-skills:docs` | Documentos editáveis e compartilháveis (memos, planos) |
| `dataviz` | Gráficos para relatórios e para o futuro dashboard |
| `design:user-research` / `research-synthesis` | Estratégia/Marketing: entrevistas com empreendedores |
| `claude-api` | Referência para a Fase 4 (Agent SDK / API) |
| `skill-creator` | Transformar processos recorrentes em skills próprias |

## Pesquisa no findskills.org
Buscas feitas: "claude code subagents", "multi-agent orchestration", "market
research competitor analysis", "project management task tracking", "startup
financial model runway", "business operations sop", "claude code agent team company".

Resultados relevantes: quase todos com o selo `community` (não verificados),
por exemplo `clawhub-startup-financial-modeling`, `clawhub-competitor-research`
e `clawhub-us-sop-builder`. Um item `verified` (`iamtouchskyer-opc`, "One
Person Company") se sobrepõe ao que construímos aqui.

## Recomendação
**Não instalar nada agora.** As skills já disponíveis cobrem as necessidades da
Fase 1. As da comunidade não foram verificadas e trariam instruções de
terceiros para dentro dos agentes. Reavaliar
`clawhub-startup-financial-modeling` quando o departamento de Finanças for
ativado, e só com sua aprovação, depois de ler o conteúdo da skill.

## Atualização (2026-11-06): skills de segurança e o Revisor de Código

**Teste real com o `code-reviewer`:** a ferramenta Skill funciona dentro do revisor.
- `code-review`: roda até o fim, mas revisa só mudanças **não commitadas**.
  Por isso a revisão passou a acontecer antes do commit.
- `security-review`: falhou por falta de `origin/HEAD` no clone local (o
  repositório estava vazio quando a sessão começou). Corrigido com
  `git remote set-head origin <branch>`. Clones novos já trazem essa referência.

**Busca no findskills** (code security review, cybersecurity, secret scanning,
dependency audit, OWASP): dezenas de resultados, **todos `community`** (sem
verificação), exceto `fuzzinglabs-mcp-security-hub` (`verified`), que é um
conjunto de ferramentas **ofensivas** (pentest) e não se aplica.

**Recomendação: não instalar.**
1. Instalar skills de terceiros não verificadas é, ironicamente, um risco de
   segurança: elas trazem instruções e scripts para dentro dos agentes.
2. Nosso código não tem dependências externas, nem rede, nem credenciais. Os
   scanners de dependências (CVE) não teriam o que analisar.
3. O que já cobre: as skills `code-review` + `security-review` (oficiais) e o
   checklist do revisor. O GitHub também oferece **varredura de segredos**
   gratuita, que podemos ativar com a sua aprovação.
4. Reavaliar quando houver código com dependências, rede ou dados de usuários
   (por exemplo, o backend da Fase 3).
