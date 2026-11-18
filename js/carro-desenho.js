// ============================================================
// Desenho do carro em vários ângulos (vistoria da OS e ficha de papel)
// ============================================================
// Um desenho só, usado em dois lugares:
//   - na tela (vistoria da OS): CarroDesenho.svg() devolve o <svg>;
//   - no PDF da ficha (servidor, PDFKit): CarroDesenho.formas() devolve os
//     caminhos com a posição de cada vista.
//
// A folha do desenho tem 640 x 300 (as marcas da vistoria guardam x/y
// nessa medida, então não mudam se a tela for maior ou menor):
//
//        [        lado esquerdo (motorista)        ]
//   [tras.] [         visto de cima           ] [frente]
//        [        lado direito (passageiro)        ]
(function (raiz) {
  const LARGURA = 640;
  const ALTURA = 300;

  // Vista de lado com a frente para a DIREITA (caixa 400 x 90).
  const LADO = [
    // carroceria (com os arcos das rodas)
    'M12 68 L10 50 Q12 42 24 40 L92 36 L138 10 Q145 7 160 6 L238 6 Q252 7 262 14 L300 36 L372 44 Q390 47 394 56 L395 68 L362 68 A28 28 0 0 0 306 68 L122 68 A28 28 0 0 0 66 68 Z',
    // vidros
    'M102 36 L140 12 Q146 10 160 10 L196 10 L196 36 Z',
    'M202 36 L202 10 L236 10 Q250 11 258 17 L288 36 Z',
    // portas
    'M199 10 L199 66', 'M294 38 L298 66', 'M118 38 L122 66',
    // maçanetas
    'M178 44 L190 44', 'M272 45 L284 45',
    // farol, lanterna, retrovisor
    'M378 50 L392 53 L392 58 L377 56 Z',
    'M11 45 L22 43 L22 52 L11 52 Z',
    'M284 34 L294 30 L296 37 Z',
    // rodas (pneu e roda)
    'M116 70 A22 22 0 1 0 72 70 A22 22 0 1 0 116 70 Z', 'M104 70 A10 10 0 1 0 84 70 A10 10 0 1 0 104 70 Z',
    'M356 70 A22 22 0 1 0 312 70 A22 22 0 1 0 356 70 Z', 'M344 70 A10 10 0 1 0 324 70 A10 10 0 1 0 344 70 Z',
  ];

  // Visto de cima com a frente para a DIREITA (caixa 400 x 90).
  const CIMA = [
    'M40 8 L360 8 Q392 10 394 45 Q392 80 360 82 L40 82 Q8 80 6 45 Q8 10 40 8 Z',
    // para-brisa, teto, vidro traseiro
    'M262 18 L300 12 Q306 45 300 78 L262 72 Z',
    'M156 18 L262 18 L262 72 L156 72 Z',
    'M156 18 L120 13 Q114 45 120 77 L156 72 Z',
    // capô e porta-malas
    'M312 18 Q356 22 384 32', 'M312 72 Q356 68 384 58',
    'M44 16 Q30 45 44 74',
    // retrovisores
    'M290 8 L296 1 L304 1 L302 8 Z', 'M290 82 L296 89 L304 89 L302 82 Z',
    // portas (divisões)
    'M206 8 L206 18', 'M206 72 L206 82',
  ];

  // De frente (caixa 90 x 90).
  const FRENTE = [
    'M8 70 L8 46 Q10 38 18 36 L24 20 Q26 12 34 12 L56 12 Q64 12 66 20 L72 36 Q80 38 82 46 L82 70 Z',
    'M22 34 L27 18 L63 18 L68 34 Z',
    'M12 42 L28 42 L28 49 L12 49 Z', 'M62 42 L78 42 L78 49 L62 49 Z',
    'M32 44 L58 44 L58 52 L32 52 Z',
    'M12 70 L26 70 L26 81 L12 81 Z', 'M64 70 L78 70 L78 81 L64 81 Z',
    'M2 31 L10 31 L10 37 L2 37 Z', 'M80 31 L88 31 L88 37 L80 37 Z',
  ];

  // De trás (caixa 90 x 90).
  const TRAS = [
    'M8 70 L8 46 Q10 38 18 36 L24 20 Q26 12 34 12 L56 12 Q64 12 66 20 L72 36 Q80 38 82 46 L82 70 Z',
    'M24 33 L29 19 L61 19 L66 33 Z',
    'M11 42 L24 42 L24 52 L11 52 Z', 'M66 42 L79 42 L79 52 L66 52 Z',
    'M35 50 L55 50 L55 58 L35 58 Z',
    'M12 70 L26 70 L26 81 L12 81 Z', 'M64 70 L78 70 L78 81 L64 81 Z',
    'M2 31 L10 31 L10 37 L2 37 Z', 'M80 31 L88 31 L88 37 L80 37 Z',
  ];

  // Onde cada vista fica na folha 640 x 300 (espelha = vira de lado).
  const VISTAS = [
    { nome: 'Lado esquerdo', caminhos: LADO, x: 520, y: 8, espelha: true, rotulo: [16, 52] },
    { nome: 'Teto (de cima)', caminhos: CIMA, x: 120, y: 105, rotulo: null },
    { nome: 'Traseira', caminhos: TRAS, x: 18, y: 108, rotulo: [63, 212] },
    { nome: 'Frente', caminhos: FRENTE, x: 532, y: 108, rotulo: [577, 212] },
    { nome: 'Lado direito', caminhos: LADO, x: 120, y: 202, rotulo: [16, 246] },
  ];

  function formas() {
    return VISTAS.map((v) => ({ nome: v.nome, x: v.x, y: v.y, espelha: !!v.espelha, caminhos: v.caminhos.slice(), rotulo: v.rotulo }));
  }

  // <svg> do desenho. opcoes.marcas = [{x, y}] desenha os números da vistoria.
  function svg(opcoes) {
    opcoes = opcoes || {};
    const traco = opcoes.traco || 'currentColor';
    const partes = VISTAS.map((v) => {
      const t = v.espelha ? 'translate(' + v.x + ' ' + v.y + ') scale(-1 1)' : 'translate(' + v.x + ' ' + v.y + ')';
      return '<g transform="' + t + '">' + v.caminhos.map((d) => '<path d="' + d + '"/>').join('') + '</g>';
    }).join('');
    const rotulos = opcoes.semRotulos ? '' : VISTAS.filter((v) => v.rotulo).map((v) =>
      '<text x="' + v.rotulo[0] + '" y="' + v.rotulo[1] + '" text-anchor="' + (v.rotulo[0] > 40 ? 'middle' : 'start') + '">' + v.nome + '</text>').join('');
    const marcas = (opcoes.marcas || []).map((m, i) =>
      '<g class="cd-marca" data-i="' + i + '"><circle cx="' + m.x + '" cy="' + m.y + '" r="11"/>' +
      '<text x="' + m.x + '" y="' + (m.y + 4.5) + '" text-anchor="middle">' + (i + 1) + '</text></g>').join('');
    return '<svg class="carro-desenho" viewBox="0 0 ' + LARGURA + ' ' + ALTURA + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Desenho do carro: lados, frente, traseira e visto de cima">' +
      '<g class="cd-traco" fill="none" stroke="' + traco + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + partes + '</g>' +
      '<g class="cd-rotulos">' + rotulos + '</g>' + marcas + '</svg>';
  }

  const api = { LARGURA, ALTURA, formas, svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CarroDesenho = api;
})(typeof window !== 'undefined' ? window : this);
