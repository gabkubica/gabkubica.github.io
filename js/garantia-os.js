// ============================================================
// Orçamento recusado e volta de garantia (OS e serviço externo)
// ============================================================
//
// - Orçamento recusado: a OS fecha e mostra o aviso vermelho; o selo do
//   status vira "Orçamento recusado" e o botão Reabrir vira "Reabrir
//   orçamento" (volta ao modo orçamento, sem mexer no estoque).
// - "Iniciar garantia" (OS concluída): pergunta qual peça falhou e o motivo
//   e abre uma OS nova ligada a esta (POST /api/ordens-servico/:id/garantia).
// - Na OS de garantia: aviso azul com a OS de origem; na origem, as
//   garantias que ela já teve.
//
// A página chama:
//   GarantiaOs.iniciar({ osAtual(), aoMudar(os, msg, tipo) })   -> uma vez
//   GarantiaOs.atualizar(os)                                      -> a cada render
(function () {
  let cfg = null;
  let rotuloReabrir = '';
  const MOTIVOS = { peca: 'defeito da peça', instalacao: 'erro na instalação', outro: 'outro motivo' };

  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }
  function dataHora(v) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function dataCurta(d) { return d.toLocaleDateString('pt-BR'); }
  async function lerJson(resp) {
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) { const e = new Error(dados.erro || 'Erro na operação.'); e.dados = dados; throw e; }
    return dados;
  }
  function linkOs(id, codigo) {
    return '<a href="/os.html?id=' + encodeURIComponent(id) + '">' + esc(codigo) + '</a>';
  }

  // ---------- montar ----------
  function montar() {
    const conteudo = document.getElementById('conteudo');
    const avisos = document.createElement('div');
    avisos.id = 'avisosOs';
    conteudo.insertBefore(avisos, conteudo.firstChild);

    const reabrir = document.getElementById('btnReabrirOs');
    rotuloReabrir = reabrir ? reabrir.textContent : 'Reabrir';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.id = 'btnIniciarGarantia';
    botao.className = 'secundario oculto';
    botao.textContent = '🛡 Iniciar garantia';
    botao.title = 'O cliente voltou com problema: abre uma OS nova de garantia ligada a esta';
    if (reabrir) reabrir.parentNode.insertBefore(botao, reabrir);
    botao.addEventListener('click', abrirDialogo);

    const dlg = document.createElement('dialog');
    dlg.id = 'dlgGarantia';
    dlg.className = 'dialog-tipos dlg-garantia';
    dlg.innerHTML =
      '<h3 id="garTitulo">Iniciar garantia</h3>' +
      '<p class="texto-suave" style="font-size:13px;margin:4px 0 0">Abre uma <strong>OS nova</strong> com o mesmo carro e cliente, marcada como garantia. ' +
        'Peças e serviços lançados nela entram com <strong>R$ 0</strong>.</p>' +
      '<h4>Qual peça deu problema?</h4><div id="garPecas"></div>' +
      '<h4>Motivo</h4>' +
      '<label class="gar-opcao"><input type="radio" name="garMotivo" value="peca"><span>Defeito da peça<small>A peça veio com problema (fábrica / fornecedor)</small></span></label>' +
      '<label class="gar-opcao"><input type="radio" name="garMotivo" value="instalacao"><span>Erro na instalação<small>Problema no serviço feito aqui</small></span></label>' +
      '<label class="gar-opcao"><input type="radio" name="garMotivo" value="outro"><span>Outro<small>Explique na observação</small></span></label>' +
      '<h4>Observação</h4><textarea id="garObs" rows="3" maxlength="1000" placeholder="Ex.: trinca saindo da borda, barulho de vento..."></textarea>' +
      '<div class="dialog-acoes"><button type="button" class="sucesso" id="garConfirmar">Abrir OS de garantia</button>' +
      '<button type="button" class="secundario" id="garFechar">Cancelar</button></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#garFechar').addEventListener('click', () => dlg.close());
    dlg.querySelector('#garConfirmar').addEventListener('click', confirmar);
  }

  // ---------- estado na tela ----------
  function atualizar(os) {
    if (!cfg) return;
    const recusado = !!(os && os.orcamento_recusado_em && os.status === 'cancelada');
    const badge = document.getElementById('statusBadge');
    if (recusado && badge) badge.innerHTML = '<span class="status-os recusado">Orçamento recusado</span>';
    const reabrir = document.getElementById('btnReabrirOs');
    if (reabrir) {
      reabrir.textContent = recusado ? 'Reabrir orçamento' : rotuloReabrir;
      reabrir.title = recusado ? 'O cliente mudou de ideia: volta para o modo orçamento (nada sai do estoque)' : reabrir.title;
    }
    document.getElementById('btnIniciarGarantia').classList.toggle('oculto', !(os && os.id && os.status === 'concluida'));

    const partes = [];
    if (recusado) {
      partes.push('<div class="aviso-recusado"><strong>✕ Orçamento recusado</strong> em ' + esc(dataHora(os.orcamento_recusado_em)) +
        '. O cliente não aprovou e nada saiu do estoque. Mudou de ideia? Clique em <strong>Reabrir orçamento</strong>.</div>');
    }
    if (os && os.garantia_origem_id) {
      partes.push('<div class="aviso-garantia"><strong>🛡 Volta de garantia</strong> da ' +
        linkOs(os.garantia_origem_id, os.garantia_origem_codigo || 'OS de origem') +
        ' · ' + esc(MOTIVOS[os.garantia_motivo] || '') +
        (os.garantia_item_nome ? ' · peça: <strong>' + esc(os.garantia_item_nome) + '</strong>' : '') +
        (os.garantia_funcionario_nome ? ' (feito por ' + esc(os.garantia_funcionario_nome) + ')' : '') +
        (os.garantia_obs ? '<br>' + esc(os.garantia_obs) : '') +
        '<br><small>Peças e serviços lançados aqui entram com R$ 0. Se for cobrar algo, mude o preço da linha.</small></div>');
    }
    const abertas = (os && os.garantias_abertas) || [];
    if (abertas.length) {
      partes.push('<div class="aviso-garantia"><strong>🛡 Esta OS já teve volta de garantia:</strong> ' +
        abertas.map((g) => linkOs(g.id, g.codigo) + (g.status === 'concluida' ? ' (concluída)' : g.status === 'cancelada' ? ' (cancelada)' : ' (aberta)')).join(', ') +
        '</div>');
    }
    document.getElementById('avisosOs').innerHTML = partes.join('');
  }

  // ---------- diálogo ----------
  function garantiaDaPeca(p, os) {
    const meses = Number(p.garantia_meses);
    if (!meses || !os.data_conclusao) return '';
    const ate = new Date(os.data_conclusao);
    ate.setMonth(ate.getMonth() + meses);
    const hoje = new Date();
    return ate >= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
      ? 'na garantia até ' + dataCurta(ate)
      : 'garantia venceu em ' + dataCurta(ate);
  }

  function abrirDialogo() {
    const os = cfg.osAtual();
    const dlg = document.getElementById('dlgGarantia');
    document.getElementById('garTitulo').textContent = 'Iniciar garantia da ' + os.codigo;
    const pecas = os.pecas || [];
    document.getElementById('garPecas').innerHTML = pecas.map((p, i) =>
      '<label class="gar-opcao"><input type="radio" name="garPeca" value="' + p.id + '"' + (i === 0 && pecas.length === 1 ? ' checked' : '') + '>' +
      '<span>' + esc(p.nome) + (Number(p.quantidade) > 1 ? ' (' + p.quantidade + ' un.)' : '') +
      '<small>' + esc([garantiaDaPeca(p, os), p.funcionario_nome ? 'feito por ' + p.funcionario_nome : ''].filter(Boolean).join(' · ')) + '</small></span></label>'
    ).join('') +
      '<label class="gar-opcao"><input type="radio" name="garPeca" value=""' + (pecas.length ? '' : ' checked') + '>' +
      '<span>Nenhuma peça<small>O problema foi só no serviço</small></span></label>';
    dlg.querySelectorAll('input[name="garMotivo"]').forEach((r) => { r.checked = false; });
    document.getElementById('garObs').value = '';
    dlg.showModal();
  }

  async function confirmar() {
    const os = cfg.osAtual();
    const dlg = document.getElementById('dlgGarantia');
    const peca = dlg.querySelector('input[name="garPeca"]:checked');
    const motivo = dlg.querySelector('input[name="garMotivo"]:checked');
    const obs = document.getElementById('garObs').value.trim();
    if (!peca) { alert('Escolha a peça que deu problema (ou "Nenhuma peça").'); return; }
    if (!motivo) { alert('Escolha o motivo.'); return; }
    if (motivo.value === 'outro' && !obs) { alert('Escreva qual foi o motivo na observação.'); document.getElementById('garObs').focus(); return; }
    const botao = document.getElementById('garConfirmar');
    botao.disabled = true;
    try {
      const nova = await lerJson(await fetch('/api/ordens-servico/' + os.id + '/garantia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peca_os_id: peca.value || null, motivo: motivo.value, obs }),
      }));
      dlg.close();
      location.href = '/os.html?id=' + encodeURIComponent(nova.id);
    } catch (e) {
      if (e.dados && e.dados.os_id) {
        if (confirm(e.message + '\n\nAbrir essa OS agora?')) location.href = '/os.html?id=' + encodeURIComponent(e.dados.os_id);
      } else {
        alert(e.message);
      }
    } finally {
      botao.disabled = false;
    }
  }

  function iniciar(opcoes) {
    cfg = opcoes;
    montar();
  }

  window.GarantiaOs = { iniciar, atualizar };
})();
