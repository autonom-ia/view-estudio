---
name: entregar
description: Fecha uma apresentação do View Estúdio - confere que a checagem e a revisão passaram, gera o PDF 16:9 (uma página por tela, no estado final), o teleprompter e as fotos, e entrega a pasta pronta com instruções de como apresentar e de como enviar. Nada sobe para a internet. Use na última etapa da nova-apresentacao, ou quando a pessoa pedir "o PDF", "a pasta pronta", "como eu apresento", "quero mandar para alguém".
---

# Entregar

A entrega é a pasta da apresentação mais o PDF. A pasta abre em qualquer computador com navegador, sem internet. O PDF vai por e-mail ou mensagem. Nada é publicado em lugar nenhum: quem envia é a pessoa.

Comandos: `./estudio <comando>` (no PowerShell, `.\estudio.cmd <comando>`). Leia só a última linha (JSON) e traduza o `codigo` por `kit/mensagens.json`. No Codex, `checar`, `fatos`, `acessibilidade`, `prints`, `pdf` e `abrir` rodam fora da área protegida.

## 1. Conferir antes de entregar
1. Leia `apresentacoes/<nome>/andamento.md`. A revisão precisa ter passado (nota 8,5 ou mais) ou a pessoa ter escolhido "Entregar assim" na terceira rodada. Se não, volte à skill `revisar`.
2. Se `andamento.md` > Pendências tiver algum item, pergunte à pessoa, um por vez, antes de gerar o PDF. O que ela resolver sai da lista; fato confirmado vai para a tabela de fatos do `brief.md`, com a fonte "a própria pessoa disse em <data>".
3. `./estudio checar <nome>`: precisa de `ok:true` e nenhum amarelo de roteiro. `./estudio fatos <nome>` e `./estudio acessibilidade <nome>`: precisam de `ok:true`. Se algo mudou desde a revisão e veio vermelho, corrija antes.

## 2. Gerar
1. `./estudio pdf <nome>`: uma página 16:9 por tela, no estado final de cada uma. Código `PDF_PRONTO`: o arquivo está em `arquivos.pdf` (`apresentacoes/<nome>/<nome>.pdf`), e `dados.paginas` precisa ser igual a `dados.telas`. `PDF_REPROVADO` (saída 2): leia `dados`, corrija a tela e rode de novo.
2. Abra o PDF e confira página por página: todas as telas, na ordem, nada cortado, vídeos no último quadro.
3. `./estudio teleprompter <nome>`: o teleprompter atualizado, ao lado do deck.

## 3. Mostrar e explicar
1. `./estudio abrir <nome>` e diga: "Está pronta. Abri a apresentação para você ver."
2. Explique em poucas linhas, sem nada técnico:
   - **Para apresentar:** abra a apresentação com `./estudio abrir <nome>` (eu faço por você, é só pedir "abre a apresentação"). Seta para baixo ou espaço avança, seta para cima volta, setas para os lados trocam de tela. Para tela cheia, aperte F11 no Windows ou Control+Command+F no Mac.
   - **Teleprompter:** abra também o teleprompter no mesmo navegador, em outra janela ou no segundo monitor. Ele acompanha cada clique sozinho.
   - **Para mandar para alguém:** o PDF. Ele fica guardado junto com a apresentação, no seu computador; eu mostro onde.
   - **Para apresentar em outro computador:** copie a apresentação inteira para um pen drive ou para a sua nuvem (para você: é a pasta `deck`) e abra o arquivo principal dela (`index.html`) com o Chrome ou o Edge. Se o navegador abrir as telas em branco, apresente por este computador, que eu abro para você.
3. Abra a pasta da apresentação para a pessoa ver onde está tudo: `./estudio abrir <nome> --pasta` (Windows: `estudio abrir <nome> --pasta`). Não use `open` nem `explorer` direto.

## 4. Fechar
Atualize `andamento.md` com `etapa: entregue`, a data e onde estão o PDF e o teleprompter.

Pergunte uma vez: "Quer guardar algo desta apresentação como regra para as próximas? (por exemplo, um tom, uma cor, um tipo de tela que funcionou)" Se sim, acrescente em `minha-marca/marca.md`.

## Regras

- Nunca publique, envie ou suba nada. Quem envia é a pessoa.
- Nunca entregue com `checar`, `fatos` ou `acessibilidade` vermelhos.
- Nunca entregue abaixo de 8,5 sem a escolha da pessoa ("Entregar assim").
