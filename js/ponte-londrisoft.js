// ============================================================
// Ponte Londrisoft na ficha (OS, venda de balcão, serviço externo)
// ============================================================
// Quadro "Nota fiscal · Londrisoft" no fim da ficha, só no Modo
// Gerenciador. Em DEMONSTRAÇÃO (sem token no servidor) ele mostra
// exatamente a pré-venda que seria mandada para o Londrisoft, com o que falta
// (peça sem código, cliente sem CPF...). Nada é enviado. Ver src/londrisoft.js.
(function () {
  const tipo = /venda\.html$/.test(location.pathname) ? 'venda' : 'os';

  function esc(t) {
    if (t === null || t === undefined) return '';
    return String(t).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function moeda(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function idAtual() { return new URLSearchParams(location.search).get('id'); }

  function montar() {
    const ficha = document.querySelector('main > .ficha');
    if (!ficha || document.getElementById('ponteLs')) return;
    const sec = document.createElement('section');
    sec.id = 'ponteLs';
    sec.className = 'os-secao ponte-ls';
    sec.setAttribute('data-somente-gerente', '');
    sec.innerHTML =
      '<div class="ponte-topo"><h2>Nota fiscal · Londrisoft <span class="selo-demo" id="lsSelo">demonstração</span></h2>' +
      '<button type="button" class="azul" id="lsPrevia">Ver o que seria enviado</button></div>' +
      '<div id="lsCorpo"><p class="aviso-vazio">A ponte manda as peças deste documento para o Londrisoft como pré-venda, ' +
      'e lá sai a nota com as regras do contador. <a href="/londrisoft.html">Como funciona</a></p></div>';
    ficha.appendChild(sec);
    document.getElementById('lsPrevia').addEventListener('click', carregar);
  }

  async function carregar() {
    const corpo = document.getElementById('lsCorpo');
    const id = idAtual();
    if (!id) {
      corpo.innerHTML = '<p class="aviso-vazio">Salve o documento primeiro.</p>';
      return;
    }
    corpo.innerHTML = '<p class="aviso-vazio">Montando...</p>';
    try {
      const r = await fetch('/api/londrisoft/' + tipo + '/' + encodeURIComponent(id) + '/previa', { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'Não foi possível montar a pré-venda.');
      desenhar(d);
    } catch (e) {
      corpo.innerHTML = '<div class="erro">' + esc(e.message) + '</div>';
    }
  }

  function desenhar(d) {
    const corpo = document.getElementById('lsCorpo');
    document.getElementById('lsSelo').textContent = d.configurado ? 'ligada' : 'demonstração';
    document.getElementById('lsSelo').classList.toggle('ligada', d.configurado);
    const pv = d.prevenda;
    const envio = d.envio;
    let html = '';
    if (envio) {
      html += envio.situacao === 'enviado'
        ? '<div class="ok">Já enviado: pré-venda nº ' + esc(envio.lancamento || '?') + ' em ' + esc(new Date(envio.enviado_em).toLocaleString('pt-BR')) + '.</div>'
        : '<div class="erro">Último envio deu erro: ' + esc(envio.erro) + '</div>';
    }
    if (d.pendencias.length) {
      html += '<div class="aviso"><strong>Antes de enviar, falta:</strong><ul class="ponte-lista">' +
        d.pendencias.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul></div>';
    }
    html += '<div class="ponte-cliente"><span class="rotulo-campo">Cliente</span> ' + esc(pv.nomcliente) +
      (d.cliente_avulso ? ' <span class="er-sub">(“' + esc(d.cliente_avulso) + '” só com nome — vai como consumidor final)</span>' : '') + '</div>';
    html += '<div class="tabela-envolve"><table class="ponte-tabela"><thead><tr><th>Peça</th><th style="width:150px">Código no Londrisoft</th>' +
      '<th style="width:60px">Qtd</th><th style="width:110px">Unit.</th><th style="width:110px">Total</th></tr></thead><tbody>' +
      (pv.itens.length ? pv.itens.map((i) => '<tr><td>' + esc(i.nomproduto) + '</td><td>' +
        (i.produto ? '<span class="er-num">' + esc(i.produto) + '</span>' : '<span class="mini-selo pendente">falta</span>') +
        '</td><td>' + i.quantidade + '</td><td>' + moeda(i.unitario) + '</td><td>' + moeda(i.total) + '</td></tr>').join('')
        : '<tr><td colspan="5" class="aviso-vazio">Sem peças.</td></tr>') +
      '</tbody></table></div>';
    html += '<div class="ponte-total">Pré-venda: <strong>' + moeda(pv.total) + '</strong></div>';
    if (d.fora.length) html += '<p class="aviso-vazio">' + d.fora.map(esc).join('<br>') + '</p>';
    html += '<details class="ponte-json"><summary>Ver como vai para o Londrisoft (técnico)</summary><pre>' + esc(JSON.stringify(pv, null, 2)) + '</pre></details>';
    const podeEnviar = d.configurado && !d.pendencias.length && !(envio && envio.situacao === 'enviado');
    html += '<div class="os-acoes" style="margin-top:10px"><button type="button" class="azul" id="lsEnviar"' + (podeEnviar ? '' : ' disabled') + '>Enviar para o Londrisoft</button>' +
      '<a class="secundario" href="/londrisoft.html">Códigos das peças</a></div>';
    if (!d.configurado) {
      html += '<p class="aviso-vazio">Envio desligado: a Londrisoft ainda não liberou o acesso (token). Quando liberar, é só configurar no servidor.</p>';
    }
    corpo.innerHTML = html;
    const btn = document.getElementById('lsEnviar');
    if (btn) btn.addEventListener('click', enviar);
  }

  async function enviar() {
    if (!confirm('Mandar este documento para o Londrisoft como pré-venda?')) return;
    const btn = document.getElementById('lsEnviar');
    btn.disabled = true;
    try {
      const r = await fetch('/api/londrisoft/' + tipo + '/' + encodeURIComponent(idAtual()) + '/enviar', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'Erro ao enviar.');
    } catch (e) {
      alert(e.message);
    }
    carregar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
