// ============================================================
// Tabela de peças do boleto novo (Despesas > Novo boleto)
// ============================================================
// Lançar a nota direto numa tabela, linha por linha, em vez de abrir uma
// janelinha para cada peça:
//   - Peça: digite o nome, o nº da etiqueta ou o código. Aparecem as peças
//     cadastradas; escolha com o mouse ou com as setas + Enter. Se não escolher
//     nenhuma, vira PEÇA NOVA (cadastrada quando der entrada no estoque).
//   - Enter passa para o próximo campo; no preço da última linha, cria outra.
//   - O total de cada linha e a soma das peças atualizam na hora.
//
// Uso: const t = BoletoPecas.montar(elemento, { aoMudar(soma) {} });
//      t.limpar(); t.linhas(); t.soma(); t.focar();
(function () {
  function esc(t) {
    if (t === null || t === undefined) return '';
    return String(t).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function moeda(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function etiqueta(n) { return n ? String(n).padStart(6, '0') : ''; }
  function centavos(v) { return Math.round(Number(v || 0) * 100); }

  function montar(raiz, opcoes) {
    const aoMudar = (opcoes && opcoes.aoMudar) || function () {};
    let linhas = [];
    let seq = 0;

    function nova() {
      return { id: ++seq, itemId: null, numero: null, codigo: null, nome: '', qtd: '', preco: '' };
    }

    function totalLinha(l) {
      const q = Number(l.qtd), p = Number(l.preco);
      return Number.isFinite(q) && Number.isFinite(p) && l.qtd !== '' && l.preco !== '' ? Math.round(q * p * 100) / 100 : 0;
    }
    function soma() { return linhas.reduce((s, l) => s + centavos(totalLinha(l)), 0) / 100; }

    function tipoHtml(l) {
      if (l.itemId) return '<span class="bp-tipo bp-tipo-ok">✓ cadastrada · nº ' + etiqueta(l.numero) + (l.codigo ? ' · ' + esc(l.codigo) : '') + '</span>';
      if (l.nome.trim()) return '<span class="bp-tipo bp-tipo-nova">peça nova: será cadastrada na entrada</span>';
      return '<span class="bp-tipo"></span>';
    }

    function linhaHtml(l, i) {
      return '<tr data-id="' + l.id + '">' +
        '<td class="bp-n">' + (i + 1) + '</td>' +
        '<td class="bp-peca"><div class="bp-peca-wrap">' +
          '<input type="text" class="bp-nome" value="' + esc(l.nome) + '" autocomplete="off" spellcheck="false" placeholder="Nome, nº ou código da peça" aria-label="Peça">' +
          tipoHtml(l) + '<div class="bp-sug oculto" role="listbox"></div></div></td>' +
        '<td><input type="number" class="bp-qtd" min="1" step="1" inputmode="numeric" value="' + esc(l.qtd) + '" aria-label="Quantidade"></td>' +
        '<td><input type="number" class="bp-preco" min="0" step="0.01" inputmode="decimal" value="' + esc(l.preco) + '" aria-label="Preço unitário"></td>' +
        '<td class="bp-total">' + (totalLinha(l) ? moeda(totalLinha(l)) : '—') + '</td>' +
        '<td><button type="button" class="btn-mini secundario bp-remover" title="Tirar esta linha" aria-label="Tirar esta linha">✕</button></td>' +
        '</tr>';
    }

    function desenhar() {
      raiz.innerHTML =
        '<div class="tabela-envolve"><table class="planilha-tabela bp-tabela"><thead><tr>' +
        '<th style="width:36px">#</th><th>Peça</th><th style="width:90px">Qtd</th><th style="width:130px">Preço unit. (R$)</th>' +
        '<th style="width:120px">Total</th><th style="width:44px"></th></tr></thead><tbody>' +
        linhas.map(linhaHtml).join('') +
        '</tbody></table></div>' +
        '<div class="bp-rodape"><button type="button" class="secundario bp-mais">+ Adicionar linha</button>' +
        '<span class="bp-soma">Soma das peças: <strong>' + moeda(soma()) + '</strong></span></div>';
    }

    function atualizarTotais(tr, l) {
      tr.querySelector('.bp-total').textContent = totalLinha(l) ? moeda(totalLinha(l)) : '—';
      raiz.querySelector('.bp-soma strong').textContent = moeda(soma());
      aoMudar(soma());
    }

    const achar = (tr) => linhas.find((l) => l.id === Number(tr.dataset.id));
    const trDe = (l) => raiz.querySelector('tr[data-id="' + l.id + '"]');

    function adicionar(focar) {
      const l = nova();
      linhas.push(l);
      desenhar();
      if (focar) trDe(l).querySelector('.bp-nome').focus();
      return l;
    }

    // ---------- sugestões de peça ----------
    let timer = null;
    let pedido = 0;
    function fecharSug(tr) {
      const s = tr && tr.querySelector('.bp-sug');
      if (s) { s.classList.add('oculto'); s.innerHTML = ''; s._itens = null; s._sel = -1; }
    }
    async function buscar(tr, termo) {
      const meu = ++pedido;
      let itens = [];
      try {
        const r = await fetch('/api/itens?q=' + encodeURIComponent(termo) + '&inicio=0&limite=8');
        const d = await r.json();
        itens = d.itens || [];
      } catch (e) { itens = []; }
      if (meu !== pedido || !document.body.contains(tr)) return;
      const s = tr.querySelector('.bp-sug');
      if (!itens.length) { fecharSug(tr); return; }
      s._itens = itens;
      s._sel = -1;
      s.innerHTML = itens.map((it, i) => {
        const custo = Number(it.ultimo_custo || it.custo_medio || it.preco_custo || 0);
        return '<button type="button" class="bp-op" data-i="' + i + '" role="option">' +
          '<span class="er-num">' + etiqueta(it.numero_interno) + '</span>' +
          '<span class="bp-op-nome"><strong>' + esc(it.nome) + '</strong> <span class="er-sub">' + esc(it.codigo || '') +
          (custo ? ' · último custo ' + moeda(custo) : '') + ' · estoque ' + it.estoque + '</span></span></button>';
      }).join('');
      s.classList.remove('oculto');
    }
    function marcar(s, i) {
      s._sel = i;
      s.querySelectorAll('.bp-op').forEach((b, j) => b.classList.toggle('ativo', j === i));
      const b = s.querySelectorAll('.bp-op')[i];
      if (b) b.scrollIntoView({ block: 'nearest' });
    }
    function escolher(tr, it) {
      const l = achar(tr);
      l.itemId = it.id;
      l.numero = it.numero_interno;
      l.codigo = it.codigo;
      l.nome = it.nome;
      const custo = Number(it.ultimo_custo || it.custo_medio || it.preco_custo || 0);
      if (l.preco === '' && custo > 0) l.preco = String(custo);
      fecharSug(tr);
      const i = linhas.indexOf(l);
      tr.outerHTML = linhaHtml(l, i);
      const novoTr = trDe(l);
      atualizarTotais(novoTr, l);
      novoTr.querySelector('.bp-qtd').focus();
    }

    raiz.addEventListener('input', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (!tr) return;
      const l = achar(tr);
      if (ev.target.classList.contains('bp-nome')) {
        l.nome = ev.target.value;
        if (l.itemId) { l.itemId = null; l.numero = null; l.codigo = null; }
        tr.querySelector('.bp-tipo').outerHTML = tipoHtml(l);
        clearTimeout(timer);
        const termo = l.nome.trim();
        if (termo.length < 2) { fecharSug(tr); return; }
        timer = setTimeout(() => buscar(tr, termo), 220);
        return;
      }
      if (ev.target.classList.contains('bp-qtd')) l.qtd = ev.target.value;
      if (ev.target.classList.contains('bp-preco')) l.preco = ev.target.value;
      atualizarTotais(tr, l);
    });

    raiz.addEventListener('keydown', (ev) => {
      const tr = ev.target.closest('tr[data-id]');
      if (!tr) return;
      const s = tr.querySelector('.bp-sug');
      const aberta = ev.target.classList.contains('bp-nome') && s._itens && !s.classList.contains('oculto');
      if (aberta && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
        ev.preventDefault();
        const n = s._itens.length;
        marcar(s, ev.key === 'ArrowDown' ? (s._sel + 1) % n : (s._sel - 1 + n) % n);
        return;
      }
      if (aberta && ev.key === 'Escape') { fecharSug(tr); return; }
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      if (aberta && s._sel >= 0) { escolher(tr, s._itens[s._sel]); return; }
      if (ev.target.classList.contains('bp-nome')) { fecharSug(tr); tr.querySelector('.bp-qtd').focus(); return; }
      if (ev.target.classList.contains('bp-qtd')) { tr.querySelector('.bp-preco').focus(); return; }
      if (ev.target.classList.contains('bp-preco')) {
        const l = achar(tr);
        const i = linhas.indexOf(l);
        if (i === linhas.length - 1) adicionar(true);
        else trDe(linhas[i + 1]).querySelector('.bp-nome').focus();
      }
    });

    raiz.addEventListener('click', (ev) => {
      const op = ev.target.closest('.bp-op');
      if (op) {
        const tr = op.closest('tr[data-id]');
        escolher(tr, tr.querySelector('.bp-sug')._itens[Number(op.dataset.i)]);
        return;
      }
      if (ev.target.closest('.bp-mais')) { adicionar(true); return; }
      const rem = ev.target.closest('.bp-remover');
      if (rem) {
        const l = achar(rem.closest('tr'));
        linhas = linhas.filter((x) => x !== l);
        if (!linhas.length) linhas.push(nova());
        desenhar();
        aoMudar(soma());
      }
    });
    // Sai do campo da peça: fecha a lista (depois do clique numa opção).
    raiz.addEventListener('focusout', (ev) => {
      if (!ev.target.classList.contains('bp-nome')) return;
      const tr = ev.target.closest('tr[data-id]');
      setTimeout(() => {
        if (tr && !tr.contains(document.activeElement)) fecharSug(tr);
      }, 180);
    });

    function limpar() {
      linhas = [nova()];
      desenhar();
      aoMudar(0);
    }
    // Primeira montagem: sem avisar (quem chamou ainda nem recebeu a tabela).
    linhas = [nova()];
    desenhar();

    return {
      limpar,
      soma,
      focar() { const i = raiz.querySelector('.bp-nome'); if (i) i.focus(); },
      // Linhas preenchidas. Linha vazia (sem peça, qtd e preço) é ignorada;
      // linha pela metade volta com "erro" e a linha é marcada.
      linhas() {
        raiz.querySelectorAll('tr.bp-erro').forEach((tr) => tr.classList.remove('bp-erro'));
        const saida = [];
        for (let i = 0; i < linhas.length; i++) {
          const l = linhas[i];
          const vazia = !l.nome.trim() && l.qtd === '' && l.preco === '';
          if (vazia) continue;
          const q = Number(l.qtd), p = Number(l.preco);
          let erro = null;
          if (!l.nome.trim()) erro = 'Linha ' + (i + 1) + ': falta a peça.';
          else if (!Number.isInteger(q) || q < 1) erro = 'Linha ' + (i + 1) + ': quantidade inválida.';
          else if (l.preco === '' || !Number.isFinite(p) || p < 0) erro = 'Linha ' + (i + 1) + ': preço inválido.';
          if (erro) {
            const tr = trDe(l);
            tr.classList.add('bp-erro');
            tr.querySelector(!l.nome.trim() ? '.bp-nome' : (erro.includes('quantidade') ? '.bp-qtd' : '.bp-preco')).focus();
            return { erro };
          }
          saida.push({ itemId: l.itemId, nome: l.nome.trim(), quantidade: q, preco: Math.round(p * 100) / 100 });
        }
        return { linhas: saida };
      },
    };
  }

  window.BoletoPecas = { montar };
})();
