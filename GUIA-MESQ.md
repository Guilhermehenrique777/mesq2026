# Guia do painel — MESQ.

Guia pra Cá mexer no site sozinha, sem depender de ninguém.

---

## Como entrar

1. Abra **https://mesqfit.com.br/admin/** (pode salvar na tela de início do celular).
2. Clique em **Sign in with GitHub**.
3. Entre com a conta do GitHub. Só na primeira vez — depois o navegador lembra.

> Se aparecer "State inválido", é só clicar em entrar de novo.

---

## Como funciona

O painel salva direto no site. Quando você clica em **Save**:

1. A alteração vai pro GitHub;
2. O site se atualiza sozinho em **1 a 2 minutos**;
3. Depois é só recarregar o site pra ver.

Não precisa avisar ninguém, não precisa fazer mais nada.

---

## O que dá pra mudar

Tudo fica em **Catálogo → Kits, preços e fotos**.

### Trocar preço

Cada kit tem dois campos:

| Campo | O que é |
|---|---|
| **Preço no PIX** | O valor à vista. Ex.: `R$ 179,90` |
| **Valor de CADA parcela no cartão (3×)** | O valor de **uma** parcela. Ex.: `R$ 71,66` |

⚠️ **Atenção no campo do cartão.** É o valor de UMA parcela, não o total.
O site multiplica por 3 sozinho. Se você colocar `R$ 71,66`, o cliente vê
"3× de R$ 71,66" e total de R$ 214,98.

Escreva sempre no formato `R$ 179,90` — com o `R$`, espaço, e vírgula nos centavos.
Se errar o formato o painel avisa antes de salvar.

### Trocar a cor do kit

O campo **Cor do kit** define o fundo da seção, a cor do botão e o letreiro —
tudo de uma vez. Escolha a cor e salve.

Se quiser controlar um tom específico, abra **Ajuste fino de cores**. Se deixar
vazio, o site calcula tudo a partir da cor principal.

### Trocar fotos e vídeos

Em **Fotos e vídeos** de cada kit:

- **+ Add** pra adicionar, a lixeira pra remover;
- Arraste pra mudar a ordem (a ordem aqui é a ordem na pilha do site);
- **Tipo**: Foto ou Vídeo;
- **Arquivo**: clique e escolha do celular. Ele sobe sozinho.
- **Vídeo com som**: marque só se o vídeo tem áudio que vale a pena — aí aparece
  o botãozinho de som em cima do vídeo.

**Antes de subir foto**, deixe ela com no máximo ~1000px de largura. Foto de
celular crua tem 4 MB e deixa o site lento no 4G.

### Adicionar um kit novo

Dentro da seção, em **Kits**, clique em **+ Add**. Preencha:

- **Identificador**: um apelido só com letras minúsculas, sem espaço nem acento
  (ex.: `turquesa`). É interno, ninguém vê.
- **Nome curto**: o que aparece no botão (ex.: `Turquesa`)
- **Nome completo**: o título (ex.: `Kit Turquesa`)
- Descrição, cor, preços, tamanhos, fotos e frases do letreiro.

### Frases do letreiro

São as frases que giram em cima da foto. Uma por linha na lista.
A primeira costuma ser `MESQ.`.

### Trocar o WhatsApp que recebe os pedidos

Em **Ajustes gerais → WhatsApp**. Só números, com 55 e DDD:
`5511966050632`.

---

## Se algo der errado

Nada se perde — o GitHub guarda todas as versões. Fala com o Guilherme que
ele volta pra versão anterior em um minuto.

**Não mexa** no campo **Identificador** da *seção* (`kits` / `kits2`) — é o que
liga a seção ao layout do site.
