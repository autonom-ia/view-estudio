---
name: cena-em-video
description: Cria uma cena animada (HTML e GSAP) e transforma em vídeo MP4 no computador da pessoa com o motor HyperFrames 0.8.181, para ser o fundo vivo de uma tela do View Estúdio, com o texto da tela por cima e pausas por clique. Use nos picos da apresentação marcados no brief, quando a pessoa pedir "uma animação", "um vídeo nessa tela", "algo que se mexa", ou quando uma ideia precisa de movimento contínuo que a tela sozinha não dá.
---

# Cena em vídeo

A cena é o filme; a tela é o controle. O vídeo carrega o movimento pesado (luz, câmera, objetos que se transformam) e o texto continua vivo no HTML da tela, por cima, entrando a cada clique. Assim o texto fica nítido, pode ser corrigido sem refazer o vídeo e o `checar` mede tudo.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`). Leia só a última linha (JSON) e traduza o `codigo` por `kit/mensagens.json`. No Codex, o `cena` roda fora da área protegida (ele abre o navegador escondido).

O vídeo sai do computador da pessoa, com o motor fixo na versão 0.8.181. Nada é enviado a serviço nenhum, nada é pago. Precisa do FFmpeg instalado (passo `ffmpeg` do instalador); se faltar, o comando avisa e a skill `instalar-estudio` instala.

## Quando usar

- No pico da apresentação (o brief marca 2 ou 3).
- Quando a ideia é uma transformação: algo que nasce, cresce, se junta, atravessa.
- Não use para enfeitar tela comum, nem para pôr texto que poderia estar no HTML.

## Passo a passo

### 1. Escrever a cena antes de fazer
No `brief.md`, na linha da tela, escreva em 3 frases: o que se vê no começo, o que muda, como termina. Diga em quais momentos a cena pausa (um por clique da tela). Duração total de 4 a 12 segundos.

Se as skills `hyperframes` e `frontend-design` estiverem instaladas, carregue-as antes de compor.

### 2. Criar a composição
`./estudio cena <nome> <composicao> --criar`
- Código `CENA_CRIADA`: o arquivo a editar vem em `arquivos.composicao`. Copia o molde de `kit/molde-cena/` para `apresentacoes/<nome>/cenas/<composicao>/`, com o GSAP e a marca ao lado. `CENA_JA_EXISTE`: edite a que já existe.
- `<composicao>`: nome curto em minúsculas e hífen, igual ao da tela (exemplo: `s05-manha`).

### 3. Compor
Edite `cenas/<composicao>/index.html`. As regras do motor (o molde mostra cada uma):
- O elemento raiz tem `data-composition-id="main"`, `data-start`, `data-duration`, `data-width="1920"` e `data-height="1080"`.
- Cada camada é um elemento com `class="clip"`, `data-start`, `data-duration` e `data-track-index`.
- Uma timeline do GSAP **pausada**, registrada em `window.__timelines.main`.
- Sem relógio, sem sorteio, sem nada que mude de uma execução para outra: o vídeo precisa sair igual sempre.
- Tudo local: imagens e fontes dentro da pasta da cena. Nenhum endereço da internet.
- **Não escreva o texto da tela dentro do vídeo.** Título, número e frase ficam no HTML da tela.
- Movimento com sentido e curvas suaves; a última imagem do vídeo é um bom fundo parado (é ela que vai para o PDF).

### 4. Transformar em vídeo
`./estudio cena <nome> <composicao>`
- `CENA_PRONTA`: o MP4 está em `arquivos.video` (fica em `deck/assets/<composicao>.mp4`).
- `FFMPEG_FALTANDO`: rode o passo `ffmpeg` do instalador. `HYPERFRAMES_FALTANDO`: rode o passo `pacotes`. `RENDER_FALHOU`: leia `dados`, corrija a composição.
- Saída 2 ou 1: leia o `codigo` em `kit/mensagens.json`, corrija a composição pela causa e rode de novo.

Confira o vídeo depois de pô-lo na tela (passo 5): o `./estudio prints <nome>` fotografa a tela em cada passo, com o vídeo no quadro daquele passo, e o `./estudio abrir <nome>` mostra o vídeo tocando. Olhe o começo, cada pausa e o fim.

### 5. Pôr na tela
Na tela `deck/slides/sNN-....html`:
- O vídeo como fundo: `<video src="../assets/<composicao>.mp4" muted playsinline preload="auto">`, sem `autoplay` e sem `loop`, cobrindo a tela atrás do texto.
- O texto com `data-beat`, como em qualquer tela.
- O vídeo anda por capítulos, um por clique, com os ganchos do `cena.js` (sempre os dois):

```js
window.CENA = {
  beats: {
    1: (tl) => { tl.call(() => { const v = document.querySelector('video'); v.currentTime = 0; v.play(); }, [], 0); },
  },
  assentar: (n) => { const v = document.querySelector('video'); v.pause(); v.currentTime = n >= 1 ? v.duration || 0 : 0; },
};
```

Ajuste os tempos aos capítulos da sua cena (pause no tempo da marca com `timeupdate` ou com um `setTimeout` do tamanho do capítulo). O `assentar` põe o vídeo no quadro certo de cada passo sem tocar: é o que o `checar`, o `prints` e o `pdf` usam.

### 6. Conferir
`./estudio checar <nome>` (vermelho: corrija) e `./estudio prints <nome>`: abra as fotos dessa tela e confira se o texto não briga com o que o vídeo mostra atrás (contraste, posição). Texto sobre área clara do vídeo pede sombra suave ou mudança de lugar, nunca uma caixa.

## Regras

- Versão do motor sempre a do estúdio (0.8.181). Nunca rode o motor fora do `./estudio cena`.
- Cena aprovada pela pessoa não se refaz sem pedido dela.
- Sem voz sintética, sem imagem gerada por serviço pago, sem vídeo de terceiros sem licença.
