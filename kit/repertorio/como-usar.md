# Repertório de apresentações

Para o assistente. A pessoa nunca lê este arquivo: fale com ela em palavras simples, como manda o `AGENTS.md`.

São fichas de apresentações reais e abertas ao público (decks publicados pelas próprias empresas ou com comentário de quem os fez, palestras com transcrição), separadas pelo que a **plateia faz depois** de ver. Cada arquivo `<ação>.json` desta pasta é uma ação. O repertório vem dentro do `kit/`, então chega a todo mundo pela atualização do estúdio; não copie para a pasta da pessoa.

| Arquivo | A plateia sai querendo |
|---|---|
| `investir.json` | investir, aprovar orçamento, liberar recurso |
| `aplicar.json` | aprender e aplicar no dia seguinte |
| `aderir.json` | mudar um comportamento, aderir a uma causa ou a um jeito novo de trabalhar |
| `confiar.json` | conhecer uma instituição e confiar nela (para trabalhar, comprar ou se juntar) |

## Por que estudar antes de desenhar

A primeira rodada de revisão sai fraca quando a direção visual nasce antes da estrutura: telas bonitas que não levam a plateia a fazer nada. O repertório mostra como apresentações que funcionaram abrem, ancoram num número, revelam aos poucos e fecham com um pedido. Estude **antes** de escrever a sequência de telas e a tese visual do brief (etapa 2 da skill `nova-apresentacao`).

## Do "o que fazer depois" do brief ao arquivo

A pergunta 2 da coleta ("O que você quer que essa plateia faça depois de ver?") decide o arquivo. Decida pelo sentido da resposta, não por palavra.

| O que a plateia faz depois | Arquivo |
|---|---|
| investir, aprovar verba ou projeto, patrocinar, liberar orçamento | `investir.json` |
| aprender, aplicar um método, treinar, usar uma ferramenta | `aplicar.json` |
| mudar um hábito, aderir a uma campanha, adotar um processo novo | `aderir.json` |
| conhecer a empresa, confiar nela, querer trabalhar ou ser cliente | `confiar.json` |
| comprar, fechar um contrato | `confiar.json` (a plateia precisa confiar antes de fechar) e `investir.json` (o valor contra o custo) |
| decidir entre opções | `investir.json` (o custo de cada caminho) e `aplicar.json` (um critério simples que a plateia leva) |

Comprar e decidir ainda não têm arquivo próprio: nenhuma apresentação dessas ações pôde ser conferida ao vivo quando o repertório foi montado.

## Só link, nunca imagem

O estúdio guarda de cada apresentação só o endereço público e o que aprendemos com ela. Nenhum print, logo, foto, lâmina ou trecho longo de outra marca entra no estúdio, na pasta da apresentação ou nas telas. As marcas e as pessoas citadas pertencem a si mesmas; a lista não diz que elas apoiam o estúdio.

## O que tem em cada ficha

| Campo | O que é |
|---|---|
| `id` | nome curto da ficha, para citar no brief |
| `nome` e `link` | a apresentação e o endereço público onde ela está |
| `ondeVer` | onde, no `link`, aparece o que a ficha descreve (o trecho da palestra, a parte da página) |
| `formato` | deck, palestra, memorando, e como ele é mostrado |
| `plateia` | para quem foi apresentada |
| `duvida` | a dúvida da plateia que a apresentação resolve, nas palavras dela |
| `estrutura` | a ordem das partes, em uma frase |
| `abertura` | como começa |
| `ancora` | o número, a imagem ou a palavra que a plateia leva para casa |
| `revelacao` | o ritmo: o que entra quando, e por quê |
| `fecho` | como termina e o que pede |
| `naoCopiar` | o que é da pessoa ou da marca deles e não serve para outra apresentação |
| `conferidaEm` | o dia (AAAA-MM-DD) em que a ficha foi conferida no próprio link |

## Como escolher (etapa 2 da skill `nova-apresentacao`)

1. **Parta do brief, não do assunto.** Leia o "o que fazer depois" e a plateia. Pergunte-se: "o que essa plateia precisa entender, ou sentir, para fazer isso?" Essa é a dúvida que a apresentação resolve.
2. Abra o arquivo da ação, pela tabela acima. Se o pedido mistura duas ações, abra os dois. Não leia todos.
3. Compare a `duvida` de cada ficha com a dúvida do brief, pelo sentido. Escolha **2 ou 3** fichas. O assunto da ficha não importa: uma palestra sobre saúde pode ensinar a abrir um pitch.
4. De cada escolhida, tire **uma decisão concreta** para o brief: a abertura, o número-âncora, o ritmo de revelação ou o fecho com pedido. Nunca o visual, a frase de efeito ou o caso deles.
5. **Confira ao vivo só as escolhidas.** Abra o `link` e veja se a página ainda existe e se o `ondeVer` ainda leva ao trecho. Se o site recusar leitura automática (acesso negado, tela de "confirme que você é humano"), ele **não saiu do ar**: escolha outra ficha e anote o motivo. Saiu do ar só quando o endereço não existe (página não encontrada, domínio sem dono). Nunca escreva a data de uma conferência que não aconteceu.
6. Registre no brief, em **Referências estudadas**, uma linha por ficha: o `id`, o link, a decisão que você tirou dela e o que não vai copiar.
7. Diga à pessoa, em uma frase, o que vai aproveitar. Exemplo: "Vou abrir como uma palestra famosa sobre saúde: um número com relógio, que mostra o custo de esperar."

## Quando nenhuma ficha serve

Procure fora do repertório uma apresentação real e pública com a mesma ação da plateia, confira o link ao vivo e registre no brief no mesmo formato. Nunca cite uma apresentação que você não abriu.

## Para quem mantém o estúdio

`node kit/scripts/manutencao/links-do-repertorio.mjs` abre o link de cada ficha e lista os que não respondem normalmente, separando o site que recusa leitor automático do site fora do ar. Fica fora do `npm test`, porque depende da internet. Ficha nova só entra com o link aberto e o conteúdo conferido por quem a escreveu, e com a data dessa conferência em `conferidaEm`.
