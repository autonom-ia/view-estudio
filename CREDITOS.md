# Créditos

O View Estúdio é MIT, © 2026 Autonom.ia (veja `LICENSE`).
Ele usa peças de outras pessoas. Cada uma segue a própria licença.

- **Versionado**: o arquivo está dentro deste repositório.
- **Baixado**: o arquivo não está aqui. Ele é baixado no computador da pessoa, na instalação, e só com a licença dela.

## Peças versionadas

| Peça | O que faz aqui | Licença | Origem |
|---|---|---|---|
| Estúdio de Reels | A casca do estúdio: instalador (Mac e Windows), ambiente, ponto de entrada `estudio`, despachante de comandos, contrato de saída em JSON, textos de instalação, permissões e o teste de máquina limpa. Copiados e adaptados (sem Python, sem modelos, sem expressão regular) | MIT, © 2026 Autonom.ia | https://github.com/autonom-ia/video-edit-autonomia |
| GSAP 3.13.0 (com Flip e ScrollTrigger) | Movimento das telas e das cenas, copiado para `deck/assets/vendor/gsap/` de cada apresentação | GSAP Standard "no charge" License | https://gsap.com/standard-license |
| Lenis 1.3.11 | Rolagem suave, em `kit/molde/deck/assets/vendor/lenis/` | MIT, © darkroom.engineering | https://github.com/darkroomengineering/lenis |
| Fraunces | Fonte de título da marca de exemplo (`kit/marca-exemplo/fontes/`) | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/fraunces (texto em `kit/marca-exemplo/fontes/OFL-Fraunces.txt`) |
| DM Sans | Fonte de texto da marca de exemplo (`kit/marca-exemplo/fontes/`) | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/dmsans (texto em `kit/marca-exemplo/fontes/OFL-DMSans.txt`) |

As fontes foram copiadas sem modificação.

## Peças baixadas no computador da pessoa

| Peça | Versão | O que faz aqui | Licença | Quem baixa |
|---|---|---|---|---|
| Node.js | `NODE_VERSAO` em `instalar/versoes.env` | Roda os comandos do estúdio | MIT | instalador, passo `node` (conferido por SHA256) |
| HyperFrames | 0.8.181 (npm `hyperframes`) | Motor que transforma uma cena em HTML em vídeo MP4 (comando `cena`) | Apache 2.0 | instalador, passo `pacotes` (`npm ci`, pelo `package-lock.json`) |
| @puppeteer/browsers | `PUPPETEER_BROWSERS_VERSAO` em `instalar/versoes.env` | Baixa o navegador escondido na versão fixa | Apache 2.0 | instalador, passo `navegador` |
| chrome-headless-shell (Chrome for Testing) | `CHROME_HEADLESS_SHELL_VERSAO` em `instalar/versoes.env` | Navegador escondido: mede as telas, tira as fotos, faz o PDF e o vídeo da cena | licenças do Chromium (BSD-3 e outras) | instalador, passo `navegador` |
| FFmpeg e FFprobe | `FFMPEG_VERSAO` em `instalar/versoes.env` | Monta o vídeo da cena | builds GPL (martin-riedl no Mac; Gyan e BtbN no Windows) | instalador, passo `ffmpeg` (conferido por SHA256) |

## O que nunca entra

- Foto, vídeo, música ou fonte de terceiros sem licença dentro do repositório.
- Material de cliente, dado pessoal ou conteúdo de apresentações reais: os exemplos usam negócios fictícios (Café Aurora, Clínica Horizonte).
- Serviço pago, conta ou envio de arquivos para a internet.
