# mesq2026 — Catálogo MESQ.

Catálogo interativo da Cá Mesquita (MESQ. — moda fitness feminina).
HTML single-file, CSS/JS puro, sem framework e sem build.

**Produção:** https://mesqfit.com.br (Cloudflare Pages)
**Painel:** https://mesqfit.com.br/admin/ — ver [GUIA-MESQ.md](GUIA-MESQ.md)

---

## Estrutura

```
index.html            layout, estilos e lógica (arquivo principal)
data/conteudo.json    fonte de verdade: kits, preços, cores, mídias
midias/               fotos (.webp) e vídeos (.mp4)
admin/                painel Sveltia CMS (config.yml + index.html)
functions/api/        OAuth do GitHub (Cloudflare Pages Functions)
_headers              cache e headers do Pages
```

O `index.html` busca o `data/conteudo.json` e monta as duas seções de kits —
tabs, cores, preços e mídias vêm todos de lá.

---

## Colocar no ar (uma vez só)

### 1. Cloudflare Pages ligado ao repo

O projeto Pages `mesq2026` **já existe** na conta Cloudflare do Guilherme, mas está
como **Direct Upload** (conferido em 25/07/2026). Falta ligar no Git:

Workers & Pages → `mesq2026` → **Settings** → **Build** → **Connect** → GitHub →
`Guilhermehenrique777/mesq2026`.

- Production branch: `main`
- Build command: *(vazio)*
- Build output directory: `/`

Isso substitui o upload manual: todo push na `main` vira deploy.

**Como saber se já está ligado:** na mesma tela, "Git repository" mostra `owner/repo`
e a branch. Se mostrar o botão *Connect*, ainda não está.

### 2. GitHub OAuth App (pro painel)

GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App:

| Campo | Valor |
|---|---|
| Application name | MESQ Painel |
| Homepage URL | `https://mesqfit.com.br` |
| Authorization callback URL | `https://mesqfit.com.br/api/callback` |

Copie o **Client ID** e gere um **Client secret**.

### 3. Variáveis no Cloudflare Pages

Settings → **Variables and secrets** (Production) — hoje está vazio:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET` *(marcar como Secret)*

Redeploy depois de salvar.

### 4. Acesso da Cá

Ela precisa de permissão de escrita no repo:
Settings → Collaborators → adicionar a conta GitHub dela.

---

## Regras do projeto

1. HTML single-file, CSS/JS puro — sem framework, sem build.
2. Edições cirúrgicas: nunca reescrever o `index.html` do zero.
3. Paleta e tipografia bloqueadas (ver tokens no `:root`).
4. Conteúdo editável mora no `data/conteudo.json`, não no HTML.
5. Mídia nova: converter pra `.webp` (fotos, ~1000px) antes de subir.

### Preços — cuidado

`precoPix` é o valor à vista. `preco3x` é o valor de **uma** parcela —
o site multiplica por 3 pra mostrar o total. Não é o PIX dividido por 3.
