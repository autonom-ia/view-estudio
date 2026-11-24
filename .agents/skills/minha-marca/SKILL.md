---
name: minha-marca
description: Registra a marca da pessoa no View Estúdio (cores, letras, logo e tom) em minha-marca/tokens.css e minha-marca/marca.md, confere o contraste e, quando usada sozinha, mostra uma amostra com a marca aplicada para aprovação (vinda da nova-apresentacao, não pergunta nada: quem mostra a marca é o piloto). Use quando faltar minha-marca/tokens.css antes da primeira apresentação, ou quando a pessoa quiser criar ou mudar cores, letras, logo ou o jeito de falar das apresentações.
---

# Minha marca

A marca vale para todas as apresentações. O comando `./estudio nova` copia para dentro de cada apresentação nova (`deck/assets/marca/`) **só o que a tela usa**: `tokens.css`, o logo (`logo.svg`, `logo.png`…) e `fontes/` (arquivos de fonte e licenças). O `marca.md` e qualquer outro arquivo ficam em `minha-marca/` e não vão para o deck; a lista do que foi e do que ficou sai em `dados.marca_copiada` e `dados.marca_fora_do_deck`. Apresentação que já existe não muda sozinha: se a pessoa quiser a marca nova numa apresentação antiga, copie esses mesmos arquivos (`tokens.css`, logo e `fontes/`) por cima de `apresentacoes/<nome>/deck/assets/marca/` e rode o `checar` dela.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`). Leia só a última linha (JSON) e traduza o `codigo` por `kit/mensagens.json`.

## O que sai daqui

```
minha-marca/
  tokens.css     as variáveis do tema (mesmos nomes de kit/marca-exemplo/tokens.css)
  fontes/        arquivos .woff2 e a licença de cada fonte (OFL-<Família>.txt)
  logo.svg       ou logo.png (se a pessoa tiver)
  marca.md       tom de voz, palavras que usa e que evita, regras de imagem
```

## Passo a passo

**Vinda da skill `nova-apresentacao` (a primeira apresentação), não pergunte nada.** Nem as perguntas do passo 1, nem as 3 direções, nem a aprovação da amostra do passo 6: a marca nasce junto com a primeira apresentação. O nome e a frase saem da coleta (de quem é a apresentação, sobre o quê), a cor sai do material que a pessoa mandou (logo, peças, apresentação antiga); sem nada para olhar, você escolhe a direção pelo assunto, pela plateia e pelo que ela contou, e anota no `marca.md` de onde veio cada escolha. Faça os passos 1 a 5 sem perguntas e pule o passo 6: quem mostra a marca à pessoa é o piloto da `nova-apresentacao` (portão 2), e o que ela pedir ali muda a marca também. Usada sozinha (a pessoa pediu para criar ou mudar a marca), siga o passo a passo inteiro, com as perguntas e a amostra.

### 1. Juntar o que já existe (uma pergunta por vez)
1. "Qual é o nome do seu negócio ou projeto, e o que ele faz, em uma frase?"
2. "Você tem logo, site ou alguma peça pronta (cartão, post, cardápio) que eu possa olhar? Se tiver arquivos, pode me mandar aqui mesmo." Se a pessoa mandar arquivos, guarde em `referencias/`. Se tiver, abra e leia as imagens. Tire as cores reais delas (hex), não as que você imagina.
3. Opcional: "Quer me dar três palavras do jeito que a sua marca fala? Se preferir, eu decido pelo que vi." (exemplo: acolhedora, direta, curiosa). Se a pessoa delegar, tire o tom das peças e do que ela já escreve.
4. Só se não houver nada para olhar: proponha 3 direções de cor e letra, cada uma com um nome e uma frase do porquê, e deixe a pessoa escolher. A recomendada primeiro, com ★.

Não pergunte o que dá para ver nas peças. Não pergunte código de cor. Vindo da skill `nova-apresentacao`, a coleta já respondeu o que importa aqui: não repita, use as respostas.

### 2. Escolher as letras
- Duas famílias no máximo: uma para título, uma para texto.
- Só fontes de licença livre (SIL Open Font License), guardadas em `minha-marca/fontes/` com a licença ao lado, **com o nome da família** (`OFL-<Família>.txt`): duas licenças chamadas `OFL.txt` na mesma pasta se sobrescrevem, e o `checar` reprova letra sem a sua licença (`fonte-sem-licenca`). Nada carregado da internet na hora da apresentação.
- Letra do Google Fonts (a que a pessoa já usa, ou a que você escolheu): avise antes ("Vou baixar a letra da sua marca. O {{agente}} vai pedir licença. Pode aprovar.") e rode `./estudio fonte "<Família>"` (o nome exato do catálogo, como "Big Shoulders Display"; no Codex, fora da área protegida, porque baixa da internet). Opções: `--pesos 300..800` (só os pesos que as telas usam), `--italico` (só se as telas usam itálico), `--larguras` (só se a marca usa larguras diferentes; pesa mais). Ele baixa o `.woff2` já recortado no alfabeto latino (cobre o português) e a licença com o nome da família, tudo ou nada. Em `FONTE_BAIXADA`, cole `dados.css` no topo do `tokens.css`, no lugar das linhas `@font-face` antigas daquela família. `dados.letras_kb_na_pasta` é o peso das letras: acima de 300 KB o `checar` avisa `fonte-pesada`.
- Para trocar a letra de uma apresentação que já existe, rode `./estudio fonte "<Família>" --apresentacao <nome>`: a letra vai para `apresentacoes/<nome>/deck/assets/marca/fontes/`, e o `dados.css` vai no `tokens.css` ao lado dela (`deck/assets/marca/tokens.css`). Rode o `checar` dela depois.
- Fonte livre que não está no Google (a pessoa mandou o arquivo e a licença): use-a e guarde a licença como `OFL-<Família>.txt`. Fonte paga ou sem licença clara: use uma livre parecida e diga isso em uma frase.
- Sem fonte definida: a letra sai da direção da marca. Escolha pelo assunto, pela plateia e pelas três palavras da etapa 1 e baixe com `./estudio fonte`. As letras de `kit/marca-exemplo/fontes/` (Fraunces e DM Sans) foram escolhidas para um negócio de exemplo: use-as só sem internet para baixar, copiando-as com as licenças, e diga isso à pessoa em uma frase.

### 3. Escrever `minha-marca/tokens.css`
Copie a estrutura de `kit/marca-exemplo/tokens.css` e troque os valores. Mantenha **todos** os nomes de variável, porque o molde e as telas usam esses nomes:

| Variável | Papel |
|---|---|
| `--cor-fundo` | fundo das telas claras |
| `--cor-tinta` | texto principal sobre o fundo claro |
| `--cor-apoio` | texto de apoio, legenda, fonte |
| `--cor-destaque` | um número, um traço, uma palavra (uso raro) |
| `--cor-noite` | fundo das telas escuras |
| `--cor-luz` e `--cor-luz-alta` | a luz e o brilho das telas escuras |
| `--cor-sobre-noite` | título e texto sobre `--cor-noite` |
| `--fonte-titulo` e `--fonte-texto` | as duas famílias, com reserva do sistema |
| `--palco-fundo` | a cor em volta da tela 16:9 |

Os `@font-face` apontam para `fontes/<arquivo>` (caminho relativo), com `font-display:block` (o `./estudio fonte` já entrega assim). Escreva um comentário curto no topo dizendo de onde veio cada cor.

### 4. Conferir o contraste
Calcule a razão de contraste (fórmula WCAG de luminância relativa) destes pares e escreva o resultado no `marca.md`:
- `--cor-tinta` sobre `--cor-fundo`: no mínimo 7:1 (texto longo em tela grande, visto de longe).
- `--cor-apoio` sobre `--cor-fundo`: no mínimo 4,5:1.
- `--cor-luz-alta` sobre `--cor-noite`: no mínimo 7:1.
- `--cor-sobre-noite` sobre `--cor-noite`: no mínimo 7:1 (é o texto das telas escuras).
- `--cor-destaque` sobre `--cor-fundo`: no mínimo 3:1 (só para número grande e traço).

Se algum par não passar, ajuste a cor (mais escura ou mais clara, mesmo tom) e diga em uma frase o que mudou e por quê.

### 5. Escrever `minha-marca/marca.md`
- O nome e a frase do negócio.
- As três palavras do tom e como cada uma aparece no texto (exemplo: "direta: frase curta, verbo no começo").
- Palavras e assuntos que a marca evita (pergunte só se a pessoa mencionar; não invente proibições).
- Regras de imagem: tipo de foto (pessoas reais, produto, lugar), luz, o que nunca usar.
- A tabela de contraste do passo 4.

### 6. Mostrar a amostra
1. Rode `./estudio nova amostra-da-marca --titulo "<nome do negócio>"`. Se vier `APRESENTACAO_JA_EXISTE`, rode de novo com outro nome (`amostra-da-marca-2`). Daqui em diante use **sempre o nome que veio em `dados.nome`** da última linha.
2. Rode `./estudio abrir <dados.nome>` (no Codex, fora da área protegida). Diga: "Abri um exemplo com a sua marca. Passe as telas com as setas."
3. Pergunte: "Ficou com a cara da sua marca?" com "Ficou ★", "Mudar as cores" e "Mudar as letras".
4. Para ajustar: mude `minha-marca/` e **copie de novo `tokens.css`, o logo e `fontes/` por cima de `apresentacoes/<dados.nome>/deck/assets/marca/`** (o `nova` só copia a marca na hora de criar; sem essa cópia a amostra continua com a marca antiga). O `marca.md` não vai para o deck. Rode `./estudio abrir <dados.nome>` de novo e peça para a pessoa recarregar a página. Repita até ela aprovar.
5. A amostra fica em `apresentacoes/<dados.nome>/`. Não apague você mesmo (o estúdio bloqueia remoção de pasta). Se a pessoa quiser tirar, diga: "É só um exemplo. Se quiser, eu mostro onde ele está guardado e você apaga." e, se ela quiser, rode `./estudio abrir <dados.nome> --pasta` para mostrar onde ele está.

## Regras

- Cor tirada de peça real vence cor inventada.
- Nunca use marca, logo ou fonte de outra empresa.
- Nada de fonte ou imagem carregada da internet na tela: tudo em `minha-marca/`.
- Não edite `kit/marca-exemplo/`: ele é do estúdio.
