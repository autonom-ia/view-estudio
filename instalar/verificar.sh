#!/bin/bash
# View Estudio: doutor do Mac.
# Confere cada programa (Node, npm, pecas, navegador escondido, FFmpeg, espaco livre) e depois chama
# "./estudio verificar". Grava instalacao.json quando os obrigatorios estao bons. A ultima linha e um JSON:
# {"ok":bool,"total":n,"prontos":n,"itens":[{"id","ok","texto","codigo"?,"passo"?}]}
# Uso: bash instalar/verificar.sh
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/instalar.sh" verificar "$@"
