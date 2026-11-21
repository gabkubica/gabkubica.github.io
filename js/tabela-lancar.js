// "Tabela inteira" (2026-11-21): uma janela com a tabela completa de peças
// (e de serviços, na OS e no externo) para lançar vendo tudo, sem precisar
// saber o que digitar na busca. Carrega de 100 em 100 ao rolar (aguenta a
// tabela de 60 mil itens) e as três caixas filtram como a busca normal.
//
// Uso: TabelaLancar.abrir({ servicos: true, lancar: async (tipo, id) => true })
//   lancar() é a função que a página já usa para adicionar a linha; devolve
//   true quando lançou. A janela fica aberta para lançar várias coisas.
(function () {
  const POR_VEZ = 100;
  let dlg = null;
  let opcoes = {};
  let aba = 'peca';
  let carregados = 0;
  let total = 0;
  let carregando = false;
  let pedido = 0;
  let espera = null;

  const esc = (t) => String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
  const moeda = (v) => (v === null || v === undefined || v === '') ? '—'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function montar() {
    dlg = document.createElement('dialog');
    dlg.className = 'dialog-tipos tl-dialogo';
    dlg.innerHTML = `
      <div class="tl-topo">
        <h3>Tabela inteira</h3>
        <div class="abas tl-abas">
          <button type="button" class="aba ativa" data-tl-aba="peca">Peças</button>
          <button type="button" class="aba" data-tl-aba="servico">Serviços</button>
        </div>
        <button type="button" class="secundario tl-fechar">Fechar</button>
      </div>
      <div class="busca-3linhas tl-busca">
        <input type="text" class="busca tl-q" autocomplete="off">
        <input type="text" class="busca tl-q" autocomplete="off">
        <input type="text" class="busca tl-q" autocomplete="off">
      </div>
      <div class="tl-info"></div>
      <div class="tl-rolagem">
        <table class="tl-tabela">
          <thead></thead>
          <tbody></tbody>
        </table>
        <div class="tl-rodape"></div>
      </div>`;
    document.body.appendChild(dlg);

    dlg.querySelector('.tl-fechar').addEventListener('click', () => dlg.close());
    dlg.querySelectorAll('[data-tl-aba]').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.tlAba)));
    dlg.querySelectorAll('.tl-q').forEach((inp) => inp.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(recomecar, 250);
    }));
    dlg.querySelector('.tl-rolagem').addEventListener('scroll', (e) => {
      const el = e.currentTarget;
      if (el.scrollTop + el.clientHeight > el.scrollHeight - 300) carregarMais();
    }, { passive: true });
    dlg.querySelector('tbody').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-tl-id]');
      if (!b || b.disabled) return;
      b.disabled = true;
      const antes = b.textContent;
      b.textContent = '...';
      let ok = false;
      try { ok = await opcoes.lancar(b.dataset.tlTipo, b.dataset.tlId); } catch (_) { ok = false; }
      b.disabled = false;
      if (ok) {
        b.textContent = '✓ Lançado';
        b.classList.add('sucesso');
        b.closest('tr').classList.add('tl-lancado');
        setTimeout(() => { b.textContent = 'Lançar'; b.classList.remove('sucesso'); }, 1800);
      } else {
        b.textContent = antes;
      }
    });
  }

  function termo() {
    return [...dlg.querySelectorAll('.tl-q')].map((i) => i.value.trim()).filter(Boolean).join(' ');
  }

  function cabecalho() {
    dlg.querySelector('thead').innerHTML = aba === 'peca'
      ? '<tr><th>Código</th><th>Nome</th><th>Marca</th><th>Local</th><th class="tl-num">Saldo</th><th class="tl-num">Levar</th><th class="tl-num">C/ inst.</th><th></th></tr>'
      : '<tr><th>Código</th><th>Serviço</th><th>Tipo</th><th class="tl-num">Valor</th><th></th></tr>';
  }

  function trocarAba(nova) {
    aba = nova;
    dlg.querySelectorAll('[data-tl-aba]').forEach((b) => b.classList.toggle('ativa', b.dataset.tlAba === aba));
    recomecar();
  }

  function recomecar() {
    pedido++;
    carregados = 0;
    total = 0;
    carregando = false;
    cabecalho();
    dlg.querySelector('tbody').innerHTML = '';
    dlg.querySelector('.tl-rolagem').scrollTop = 0;
    carregarMais();
  }

  function linhaPeca(i) {
    const saldo = Number(i.estoque);
    return `<tr>
      <td class="tl-cod">${esc(i.codigo)}</td>
      <td class="tl-nome">${esc(i.nome)}</td>
      <td>${esc(i.marca || '')}</td>
      <td>${esc(i.localizacao || '—')}</td>
      <td class="tl-num${saldo <= 0 ? ' tl-zero' : ''}">${esc(i.estoque)}</td>
      <td class="tl-num">${moeda(i.preco)}</td>
      <td class="tl-num">${moeda(i.preco_com_instalacao)}</td>
      <td><button type="button" class="btn-mini" data-tl-tipo="peca" data-tl-id="${esc(i.id)}">Lançar</button></td>
    </tr>`;
  }
  function linhaServico(s) {
    return `<tr>
      <td class="tl-cod">${esc(s.codigo || '')}</td>
      <td class="tl-nome">${esc(s.nome)}</td>
      <td>${esc(s.tipo || '')}</td>
      <td class="tl-num">${moeda(s.valor_padrao)}</td>
      <td><button type="button" class="btn-mini" data-tl-tipo="servico" data-tl-id="${esc(s.id)}">Lançar</button></td>
    </tr>`;
  }

  async function carregarMais() {
    if (carregando || (carregados > 0 && carregados >= total)) return;
    carregando = true;
    const meu = pedido;
    const rodape = dlg.querySelector('.tl-rodape');
    rodape.textContent = 'Carregando...';
    const q = termo();
    const url = (aba === 'peca' ? '/api/itens' : '/api/servicos') +
      '?limite=' + POR_VEZ + '&inicio=' + carregados + (q ? '&q=' + encodeURIComponent(q) : '');
    let dados = null;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) dados = await r.json();
    } catch (_) { /* sem rede */ }
    if (meu !== pedido) return; // trocou o filtro no meio
    carregando = false;
    if (!dados) { rodape.textContent = 'Não consegui carregar a tabela.'; return; }
    const lista = (aba === 'peca' ? dados.itens : dados.servicos) || [];
    total = Number(dados.total ?? (carregados + lista.length));
    carregados += lista.length;
    dlg.querySelector('tbody').insertAdjacentHTML('beforeend', lista.map(aba === 'peca' ? linhaPeca : linhaServico).join(''));
    const nomeTipo = aba === 'peca' ? 'peças' : 'serviços';
    dlg.querySelector('.tl-info').textContent = total === 0
      ? 'Nada encontrado.'
      : 'Mostrando ' + carregados.toLocaleString('pt-BR') + ' de ' + total.toLocaleString('pt-BR') + ' ' + nomeTipo +
        (q ? ' com "' + q + '"' : '') + '.' + (carregados < total ? ' Role para ver mais.' : '') + ' "Lançar" põe na ficha e a tabela continua aberta.';
    rodape.textContent = carregados < total ? '' : (total ? 'Fim da tabela.' : '');
    if (lista.length === 0) total = carregados;
    // Tela grande: se ainda não encheu a janela, já busca o próximo pedaço.
    const rol = dlg.querySelector('.tl-rolagem');
    if (carregados < total && rol.scrollHeight <= rol.clientHeight + 50) carregarMais();
  }

  function abrir(op) {
    opcoes = op || {};
    if (!dlg) montar();
    dlg.querySelector('[data-tl-aba="servico"]').classList.toggle('oculto', !opcoes.servicos);
    dlg.querySelector('.tl-abas').classList.toggle('oculto', !opcoes.servicos);
    if (!opcoes.servicos) aba = 'peca';
    dlg.querySelectorAll('.tl-q').forEach((i) => { i.value = ''; });
    dlg.querySelectorAll('[data-tl-aba]').forEach((b) => b.classList.toggle('ativa', b.dataset.tlAba === aba));
    dlg.showModal();
    recomecar();
    dlg.querySelector('.tl-q').focus();
  }

  window.TabelaLancar = { abrir };
})();
