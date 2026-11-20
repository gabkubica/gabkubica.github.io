// ============================================================
// Gráficos do sistema (sem biblioteca de fora: funciona sem internet)
// ============================================================
// Graficos.barras(el, { rotulos, series:[{nome, valores, cor}], formato, altura, destaque })
//   barras em pé (uma ou mais séries lado a lado), com eixo e grade.
// Graficos.linha(el, { rotulos, series:[{nome, valores, cor}], formato, altura })
// Graficos.ranking(el, { itens:[{nome, valor, sub, href}], formato, porcentagem, cor, vazio })
//   barras deitadas, do maior para o menor, com o valor na ponta.
// Graficos.empilhado(el, { series:[{nome, cor}], itens:[{nome, partes:[...]}], formato })
// Graficos.rosca(el, { itens:[{nome, valor, cor}], formato, centro })
//   "pizza" com furo: como um total se divide (até 6 fatias + lista com %).
//
// Cores: cor = 1..6 (paleta --serie-N do estilo.css, validada para
// daltonismo no claro e no escuro). Passar o mouse mostra os números.
// Os gráficos se redesenham sozinhos quando a tela muda de largura.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  let contadorListras = 0;

  function moeda(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function moedaCurta(v) {
    const a = Math.abs(v);
    const s = v < 0 ? '-' : '';
    if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (a >= 1e3) return s + 'R$ ' + (a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e4 ? 0 : 1 }) + ' mil';
    return s + 'R$ ' + Math.round(a).toLocaleString('pt-BR');
  }
  function numero(v) { return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }); }
  function fmt(v, formato, curto) {
    if (formato === 'moeda') return curto ? moedaCurta(v) : moeda(v);
    if (formato === 'dias') return numero(v) + (Number(v) === 1 ? ' dia' : ' dias');
    if (formato === 'pct') return numero(v) + '%';
    return numero(v);
  }
  // Cor por número (1..6, paleta das séries) ou pelo SIGNIFICADO:
  // 'bom' (verde: dinheiro entrando, coisa boa), 'ruim' (vermelho: saída,
  // problema), 'atencao' (amarelo), 'neutro' (cinza: só quantidade).
  function cor(n) {
    if (typeof n === 'string' && !/^\d+$/.test(n)) return 'var(--cor-' + n + ')';
    return 'var(--serie-' + (n || 1) + ')';
  }
  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  // Escala "redonda": 0, 5 mil, 10 mil... (4 ou 5 linhas de grade).
  function escala(min, max) {
    if (max === min) max = min + 1;
    const bruto = (max - min) / 4;
    const p = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= bruto);
    const ini = Math.floor(min / passo) * passo;
    const fim = Math.ceil(max / passo) * passo;
    const marcas = [];
    for (let v = ini; v <= fim + passo / 2; v += passo) marcas.push(Math.round(v * 100) / 100);
    return { ini, fim, marcas };
  }

  // Redesenha quando a largura muda (sem repetir à toa).
  function aoMudarLargura(raiz, desenhar) {
    if (raiz.__obs) raiz.__obs.disconnect();
    raiz.__ultima = 0;
    raiz.__desenhar = desenhar;
    raiz.classList.add('gr-raiz');
    // Desenha já, se a área está visível (o aviso de tamanho pode demorar ou
    // nem vir, por ex. com a janela minimizada); depois só redesenha se mudar.
    conferir(raiz);
    raiz.__obs = new ResizeObserver(() => conferir(raiz));
    raiz.__obs.observe(raiz);
  }
  function conferir(raiz) {
    const w = Math.round(raiz.clientWidth);
    if (w && w !== raiz.__ultima) { raiz.__ultima = w; raiz.__desenhar(w); }
  }
  // Para quando uma parte escondida aparece (ex.: trocar de aba).
  function redesenhar(container) {
    (container || document).querySelectorAll('.gr-raiz').forEach((r) => r.__desenhar && conferir(r));
  }

  function legendaHtml(series) {
    if (!series || series.length < 2) return '';
    return '<div class="gr-legenda">' + series.map((s) =>
      '<span><i style="background:' + cor(s.cor) + '"></i>' + esc(s.nome) + '</span>').join('') + '</div>';
  }

  function dica(raiz) {
    let d = raiz.querySelector('.gr-dica');
    if (!d) {
      d = document.createElement('div');
      d.className = 'gr-dica';
      raiz.appendChild(d);
    }
    return {
      mostrar(html, x, y) {
        d.innerHTML = html;
        d.style.display = 'block';
        const w = d.offsetWidth;
        const larg = raiz.clientWidth;
        d.style.left = Math.max(0, Math.min(larg - w, x - w / 2)) + 'px';
        d.style.top = Math.max(0, y - d.offsetHeight - 10) + 'px';
      },
      esconder() { d.style.display = 'none'; },
    };
  }

  function vazio(raiz, texto) {
    raiz.innerHTML = '<div class="gr-vazio">' + esc(texto || 'Sem dados neste período.') + '</div>';
  }

  // ---------- eixo comum (barras e linha) ----------
  function eixo(svg, o, W, H, formato, folgaTopo) {
    const todos = o.series.flatMap((s) => s.valores.map(Number));
    if (o.marcador) todos.push(Number(o.marcador.valor || 0));
    const sc = escala(Math.min(0, ...todos), Math.max(0, ...todos));
    const esq = Math.max(...sc.marcas.map((m) => fmt(m, formato, true).length)) * 6.4 + 10;
    const topo = folgaTopo || 8;
    const area = { x: esq, y: topo, w: W - esq - 6, h: H - topo - 26 };
    const y = (v) => area.y + area.h - ((v - sc.ini) / (sc.fim - sc.ini)) * area.h;
    for (const m of sc.marcas) {
      svg.appendChild(el('line', { x1: area.x, x2: area.x + area.w, y1: y(m), y2: y(m), class: m === 0 ? 'gr-zero' : 'gr-grade' }));
      const t = el('text', { x: area.x - 8, y: y(m) + 4, class: 'gr-eixo', 'text-anchor': 'end' });
      t.textContent = fmt(m, formato, true);
      svg.appendChild(t);
    }
    const n = o.rotulos.length;
    const banda = area.w / n;
    const pular = Math.ceil(n / Math.max(1, Math.floor(area.w / 46)));
    o.rotulos.forEach((r, i) => {
      if (i % pular !== 0 && i !== n - 1) return;
      const t = el('text', { x: area.x + banda * i + banda / 2, y: H - 8, class: 'gr-eixo', 'text-anchor': 'middle' });
      t.textContent = r;
      svg.appendChild(t);
    });
    return { area, y, banda };
  }

  // Opções extras das barras (2026-11-20, para ler no tablet sem passar o mouse):
  //   valores: true (padrão) escreve o número em cima das barras quando cabe;
  //            com 2 séries ou pouco espaço, só na última coluna.
  //   parcial: índice da coluna que ainda não terminou (ex.: o mês de hoje):
  //            barra mais clara e tracejada.
  //   marcador: { indice, valor, texto } traço na coluna (ex.: onde o mês
  //            anterior estava no mesmo dia).
  //   aoClicar(i) + textoClique: no mouse, clique abre; no toque, o 1º toque
  //            mostra os números e o 2º abre.
  function barras(raiz, o) {
    const formato = o.formato || 'numero';
    if (!o.rotulos.length || o.series.every((s) => s.valores.every((v) => !Number(v)))) return vazio(raiz, o.vazio);
    raiz.classList.add('gr');
    const desenhar = (W) => {
      const H = o.altura || 220;
      raiz.innerHTML = legendaHtml(o.series);
      const svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.titulo || 'Gráfico de barras' });
      const temValores = o.valores !== false;
      // Nome único das listras deste gráfico (um nome repetido em outra aba,
      // escondida, fazia a barra listrada aparecer vazia).
      const idListra = 'gr-listra-' + (++contadorListras) + '-';
      const { area, y, banda } = eixo(svg, o, W, H, formato, temValores ? 18 : 8);
      const ns = o.series.length;
      const larg = Math.max(3, Math.min(ns === 1 ? 46 : 30, (banda * 0.72 - (ns - 1) * 2) / ns));
      const grupo = larg * ns + (ns - 1) * 2;
      const barrasPorCat = [];
      o.rotulos.forEach((_, i) => {
        const x0 = area.x + banda * i + (banda - grupo) / 2;
        const lista = [];
        o.series.forEach((s, j) => {
          const v = Number(s.valores[i] || 0);
          const y0 = y(0);
          const y1 = y(v);
          const alto = Math.abs(y1 - y0);
          const x = x0 + j * (larg + 2);
          const topo = Math.min(y0, y1);
          const r = Math.min(4, larg / 2, alto);
          // Ponta arredondada só do lado do valor (presa na linha do zero).
          const d = v >= 0
            ? `M${x},${y0} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + larg - r} Q${x + larg},${topo} ${x + larg},${topo + r} V${y0} Z`
            : `M${x},${y0} V${topo + alto - r} Q${x},${topo + alto} ${x + r},${topo + alto} H${x + larg - r} Q${x + larg},${topo + alto} ${x + larg},${topo + alto - r} V${y0} Z`;
          const parcial = o.parcial === i;
          // corPorValor: positivo verde, negativo vermelho (ex.: resultado do mês).
          const corBarra = o.corPorValor ? (v >= 0 ? 'bom' : 'ruim') : (s.cor || 1);
          const p = el('path', {
            d: alto < 0.5 ? `M${x},${y0} H${x + larg}` : d,
            fill: parcial ? 'url(#' + idListra + corBarra + ')' : cor(corBarra),
            class: 'gr-barra' + (o.destaque === i ? ' gr-dest' : '') + (parcial ? ' gr-parcial' : ''),
          });
          if (parcial) { p.setAttribute('stroke', cor(corBarra)); p.setAttribute('stroke-width', '1.5'); p.setAttribute('stroke-dasharray', '4 3'); }
          if (alto < 0.5) { p.setAttribute('stroke', cor(corBarra)); p.setAttribute('stroke-width', '1'); }
          svg.appendChild(p);
          lista.push(p);
          // Número em cima da barra: todas quando há uma série e espaço;
          // senão só a última coluna (a mais recente).
          const cabe = ns === 1 && banda >= 34;
          if (temValores && v !== 0 && (cabe || i === o.rotulos.length - 1)) {
            const t = el('text', { x: x + larg / 2, y: v >= 0 ? topo - 5 : topo + alto + 13, class: 'gr-valor', 'text-anchor': 'middle' });
            t.textContent = fmt(v, formato, true);
            svg.appendChild(t);
          }
        });
        barrasPorCat.push(lista);
      });
      // Listras da barra "ainda não terminou" (uma por cor usada).
      if (o.parcial !== undefined && o.parcial !== null) {
        const defs = el('defs', {});
        const cores = o.corPorValor ? ['bom', 'ruim'] : o.series.map((s) => s.cor || 1);
        for (const c of cores) {
          const pat = el('pattern', { id: idListra + c, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
          pat.appendChild(el('rect', { width: 6, height: 6, fill: cor(c), 'fill-opacity': '0.25' }));
          pat.appendChild(el('rect', { width: 2.5, height: 6, fill: cor(c), 'fill-opacity': '0.75' }));
          defs.appendChild(pat);
        }
        svg.insertBefore(defs, svg.firstChild);
      }
      // Traço de comparação (ex.: mês anterior até o mesmo dia).
      if (o.marcador && o.marcador.indice >= 0) {
        const i = o.marcador.indice;
        const ym = y(Number(o.marcador.valor || 0));
        const x1 = area.x + banda * i + banda * 0.08;
        const x2 = area.x + banda * i + banda * 0.92;
        svg.appendChild(el('line', { x1, x2, y1: ym, y2: ym, class: 'gr-marcador' }));
        if (o.marcador.texto) {
          const t = el('text', { x: x1 - 4, y: ym + 4, class: 'gr-marcador-txt', 'text-anchor': 'end' });
          t.textContent = o.marcador.texto;
          svg.appendChild(t);
        }
      }
      // Área de passar o mouse / tocar: a coluna inteira (maior que a barra).
      const tt = dica(raiz);
      let tocada = -1;
      const mostrar = (i) => {
        svg.classList.add('gr-foco');
        barrasPorCat.forEach((l, k) => l.forEach((b) => b.classList.toggle('gr-ativa', k === i)));
        const linhas = o.series.map((s) => '<div><i style="background:' + cor(s.cor) + '"></i>' + (ns > 1 ? esc(s.nome) + ': ' : '') +
          '<b>' + fmt(s.valores[i], formato) + '</b></div>').join('');
        const extra = o.dica ? o.dica(i) : '';
        const clique = o.aoClicar && o.textoClique ? '<div class="gr-dica-acao">' + esc(o.textoClique) + '</div>' : '';
        tt.mostrar('<div class="gr-dica-tit">' + esc(o.rotulosLongos ? o.rotulosLongos[i] : o.rotulos[i]) + '</div>' + linhas + extra + clique,
          area.x + banda * i + banda / 2, Math.min(...barrasPorCat[i].map((b) => b.getBBox().y)));
      };
      const esconder = () => {
        svg.classList.remove('gr-foco');
        barrasPorCat.forEach((l) => l.forEach((b) => b.classList.remove('gr-ativa')));
        tt.esconder();
      };
      o.rotulos.forEach((rot, i) => {
        const alvo = el('rect', { x: area.x + banda * i, y: area.y, width: banda, height: area.h, fill: 'transparent' });
        alvo.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') mostrar(i); });
        alvo.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') esconder(); });
        alvo.addEventListener('click', (e) => {
          const toque = e.pointerType && e.pointerType !== 'mouse';
          // No toque: o 1º toque mostra os números; o 2º (na mesma coluna) abre.
          if (toque && tocada !== i) { tocada = i; mostrar(i); return; }
          tocada = -1;
          if (o.aoClicar) { esconder(); o.aoClicar(i); } else if (toque) { mostrar(i); }
        });
        if (o.aoClicar) alvo.style.cursor = 'pointer';
        svg.appendChild(alvo);
      });
      raiz.appendChild(svg);
    };
    aoMudarLargura(raiz, desenhar);
  }

  // ---------- rosca ("pizza") ----------
  // Graficos.rosca(el, { itens:[{nome, valor, cor, sub}], formato, vazio, centro })
  // Para mostrar como UM total se divide. No máximo 6 fatias: o resto vira
  // "Outros" (cinza). Ao lado, a lista com o valor e a % de cada fatia — a
  // leitura não depende só da cor.
  function rosca(raiz, o) {
    const formato = o.formato || 'numero';
    let itens = (o.itens || []).filter((x) => Number(x.valor) > 0).map((x) => ({ ...x, valor: Number(x.valor) }));
    if (!itens.length) return vazio(raiz, o.vazio);
    if (!o.manterOrdem) itens.sort((a, b) => b.valor - a.valor);
    if (itens.length > 6) {
      const resto = itens.slice(5);
      itens = itens.slice(0, 5).concat([{ nome: 'Outros (' + resto.length + ')', valor: resto.reduce((s, x) => s + x.valor, 0), cor: 'outro' }]);
    }
    const total = itens.reduce((s, x) => s + x.valor, 0);
    raiz.classList.remove('gr');
    const R = 62;
    const r = 40;
    const C = 70;
    const ponto = (ang, raio) => [C + raio * Math.sin(ang), C - raio * Math.cos(ang)];
    let ang = 0;
    const fatias = itens.map((x, i) => {
      const parte = x.valor / total;
      const a0 = ang;
      const a1 = ang + parte * Math.PI * 2;
      ang = a1;
      const corFatia = x.cor === 'outro' ? 'var(--serie-outro)' : cor(x.cor || i + 1);
      if (parte >= 0.9999) {
        return '<circle cx="' + C + '" cy="' + C + '" r="' + ((R + r) / 2) + '" fill="none" stroke="' + corFatia + '" stroke-width="' + (R - r) + '" data-i="' + i + '"/>';
      }
      const [x0, y0] = ponto(a0, R);
      const [x1, y1] = ponto(a1, R);
      const [x2, y2] = ponto(a1, r);
      const [x3, y3] = ponto(a0, r);
      const grande = a1 - a0 > Math.PI ? 1 : 0;
      return '<path d="M' + x0 + ',' + y0 + ' A' + R + ',' + R + ' 0 ' + grande + ' 1 ' + x1 + ',' + y1 + ' L' + x2 + ',' + y2 +
        ' A' + r + ',' + r + ' 0 ' + grande + ' 0 ' + x3 + ',' + y3 + ' Z" fill="' + corFatia + '" class="gr-fatia" data-i="' + i + '"/>';
    });
    const centro = o.centro || { valor: fmt(total, formato, true), rotulo: 'total' };
    raiz.innerHTML =
      '<div class="gr-rosca">' +
        '<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="' + esc(o.titulo || 'Gráfico de rosca') + '">' +
          fatias.join('') +
          '<text x="70" y="68" text-anchor="middle" class="gr-rosca-num">' + esc(centro.valor) + '</text>' +
          '<text x="70" y="85" text-anchor="middle" class="gr-rosca-rot">' + esc(centro.rotulo) + '</text>' +
        '</svg>' +
        '<ul class="gr-rosca-lista">' + itens.map((x, i) => {
          const pct = Math.round((x.valor / total) * 100);
          const corFatia = x.cor === 'outro' ? 'var(--serie-outro)' : cor(x.cor || i + 1);
          return '<li data-i="' + i + '"><i style="background:' + corFatia + '"></i>' +
            '<span class="gr-rosca-nome">' + esc(x.nome) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span>' +
            '<b>' + pct + '%</b><span class="gr-rosca-val">' + fmt(x.valor, formato) + '</span></li>';
        }).join('') + '</ul>' +
      '</div>';
    // Passar o mouse (ou tocar) numa fatia destaca a linha da lista, e vice-versa.
    const marcar = (i) => raiz.querySelectorAll('[data-i]').forEach((e) => e.classList.toggle('gr-ativa', i !== null && e.dataset.i === String(i)));
    raiz.querySelectorAll('[data-i]').forEach((e) => {
      e.addEventListener('pointerenter', () => marcar(e.dataset.i));
      e.addEventListener('pointerleave', () => marcar(null));
      e.addEventListener('click', () => marcar(e.dataset.i));
    });
  }

  function linha(raiz, o) {
    const formato = o.formato || 'numero';
    if (!o.rotulos.length) return vazio(raiz, o.vazio);
    raiz.classList.add('gr');
    const desenhar = (W) => {
      const H = o.altura || 220;
      raiz.innerHTML = legendaHtml(o.series);
      const svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': o.titulo || 'Gráfico de linha' });
      const { area, y, banda } = eixo(svg, o, W, H, formato);
      const xDe = (i) => area.x + banda * i + banda / 2;
      for (const s of o.series) {
        const pts = s.valores.map((v, i) => xDe(i) + ',' + y(Number(v || 0))).join(' ');
        svg.appendChild(el('polyline', { points: pts, fill: 'none', stroke: cor(s.cor), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      }
      const marca = el('g', { class: 'gr-marca', style: 'display:none' });
      svg.appendChild(marca);
      const tt = dica(raiz);
      o.rotulos.forEach((rot, i) => {
        const alvo = el('rect', { x: area.x + banda * i, y: area.y, width: banda, height: area.h, fill: 'transparent' });
        alvo.addEventListener('mouseenter', () => {
          marca.innerHTML = '';
          marca.appendChild(el('line', { x1: xDe(i), x2: xDe(i), y1: area.y, y2: area.y + area.h, class: 'gr-grade' }));
          for (const s of o.series) marca.appendChild(el('circle', { cx: xDe(i), cy: y(Number(s.valores[i] || 0)), r: 4.5, fill: cor(s.cor), class: 'gr-ponto' }));
          marca.style.display = '';
          const linhas = o.series.map((s) => '<div><i style="background:' + cor(s.cor) + '"></i>' + (o.series.length > 1 ? esc(s.nome) + ': ' : '') +
            '<b>' + fmt(s.valores[i], formato) + '</b></div>').join('');
          tt.mostrar('<div class="gr-dica-tit">' + esc(o.rotulosLongos ? o.rotulosLongos[i] : rot) + '</div>' + linhas + (o.dica ? o.dica(i) : ''),
            xDe(i), Math.min(...o.series.map((s) => y(Number(s.valores[i] || 0)))));
        });
        alvo.addEventListener('mouseleave', () => { marca.style.display = 'none'; tt.esconder(); });
        svg.appendChild(alvo);
      });
      raiz.appendChild(svg);
    };
    aoMudarLargura(raiz, desenhar);
  }

  // Barras deitadas (HTML): nome | barra | valor. Do maior para o menor.
  function ranking(raiz, o) {
    const formato = o.formato || 'numero';
    const itens = (o.itens || []).filter((x) => Number(x.valor) > 0);
    if (!itens.length) return vazio(raiz, o.vazio);
    const max = Math.max(...itens.map((x) => Number(x.valor)));
    const total = itens.reduce((s, x) => s + Number(x.valor), 0);
    raiz.classList.remove('gr');
    raiz.innerHTML = '<div class="gr-rank">' + itens.map((x) => {
      const pct = total ? Math.round((Number(x.valor) / total) * 100) : 0;
      const nome = x.href ? '<a href="' + esc(x.href) + '">' + esc(x.nome) + '</a>' : esc(x.nome);
      return '<div class="gr-rank-linha' + (x.apagado ? ' gr-apagado' : '') + '" title="' + esc(x.nome + ': ' + fmt(x.valor, formato) + (x.sub ? ' · ' + x.sub : '')) + '">' +
        '<div class="gr-rank-nome">' + nome + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</div>' +
        '<div class="gr-rank-trilho"><div style="width:' + Math.max(1.5, (Number(x.valor) / max) * 100) + '%;background:' + cor(x.cor || o.cor) + '"></div></div>' +
        '<div class="gr-rank-valor">' + fmt(x.valor, formato) + (o.porcentagem ? '<small>' + pct + '%</small>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  // Barras deitadas empilhadas (ex.: peças + serviços de cada funcionário).
  function empilhado(raiz, o) {
    const formato = o.formato || 'numero';
    const itens = (o.itens || []).filter((x) => x.partes.some((v) => Number(v) > 0));
    if (!itens.length) return vazio(raiz, o.vazio);
    const totais = itens.map((x) => x.partes.reduce((s, v) => s + Number(v || 0), 0));
    const max = Math.max(...totais);
    raiz.classList.remove('gr');
    raiz.innerHTML = legendaHtml(o.series) + '<div class="gr-rank">' + itens.map((x, i) =>
      '<div class="gr-rank-linha">' +
        '<div class="gr-rank-nome">' + esc(x.nome) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</div>' +
        '<div class="gr-rank-trilho"><div class="gr-pilha" style="width:' + Math.max(2, (totais[i] / max) * 100) + '%">' +
          x.partes.map((v, j) => Number(v) > 0
            ? '<div style="flex:' + Number(v) + ';background:' + cor(o.series[j].cor) + '" title="' + esc(o.series[j].nome + ': ' + fmt(v, formato)) + '"></div>' : '').join('') +
        '</div></div>' +
        '<div class="gr-rank-valor">' + fmt(totais[i], formato) + '</div></div>').join('') + '</div>';
  }

  window.Graficos = { barras, linha, ranking, empilhado, rosca, redesenhar, moeda, moedaCurta, fmt };
})();
