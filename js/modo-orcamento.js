// ============================================================
// Modo orçamento da OS (usado pela OS e pelo serviço externo)
// ============================================================
//
// Ligado: a ficha muda de cor e vira "ORÇAMENTO"; peças lançadas NÃO saem
// do estoque (as que já estavam voltam). Aparece a faixa com:
//   - Mensagem para o WhatsApp (texto pronto, dá para editar antes)
//   - PDF do orçamento (para mandar ao cliente)
//   - Aprovar orçamento: sai do modo e TODAS as peças saem do estoque.
//   - Orçamento recusado: o cliente não quis. Fecha a OS (fica no histórico
//     em vermelho; nada para devolver ao estoque). "Reabrir" volta ao orçamento.
// Para ninguém esquecer que está no modo: faixa presa no alto da tela,
// ficha listrada e cada peça/serviço marcado "orçamento".
//
// A página chama:
//   ModoOrcamento.iniciar({ osAtual(), garantirOs(), aoMudar(os, msg, tipo) })
//   ModoOrcamento.atualizar(os)   -> a cada render
//   ModoOrcamento.ativo(os)       -> true no modo orçamento
(function () {
  let cfg = null;
  let tipoOriginal = '';

  function esc(t) {
    return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }
  function moeda(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  async function lerJson(resp) {
    const dados = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(dados.erro || 'Erro na operação.');
    return dados;
  }
  function ativo(os) {
    return !!os && os.status === 'orcamento';
  }

  // ---------- montar na página ----------
  function montar() {
    const doc = document.querySelector('.ficha-doc');
    const tipo = document.querySelector('.ficha-tipo');
    tipoOriginal = tipo ? tipo.textContent : '';
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.id = 'btnModoOrcamento';
    botao.className = 'btn-modo-orcamento secundario';
    botao.textContent = 'Modo orçamento';
    botao.title = 'As peças lançadas não saem do estoque até o orçamento ser aprovado';
    // Ao lado do status; as marcações (cliente avisado...) ficam embaixo.
    const marcas = doc.querySelector('.ficha-marcas');
    if (marcas) doc.insertBefore(botao, marcas); else doc.appendChild(botao);
    botao.addEventListener('click', ligar);

    const faixa = document.createElement('div');
    faixa.id = 'faixaOrcamento';
    faixa.className = 'faixa-orcamento oculto';
    faixa.innerHTML =
      '<div class="faixa-orcamento-texto"><span class="selo-orcamento">MODO ORÇAMENTO</span> ' +
        'Nada do que está aqui <strong>sai do estoque</strong> ainda. Cliente aprovou? "Aprovar orçamento". Não quis? "Orçamento recusado".</div>' +
      '<div class="faixa-orcamento-acoes">' +
        '<button type="button" class="secundario" data-orc="mensagem">Mensagem para o WhatsApp</button>' +
        '<button type="button" class="secundario" data-orc="pdf">PDF do orçamento</button>' +
        '<button type="button" class="sucesso" data-orc="aprovar">Aprovar orçamento</button>' +
        '<button type="button" class="perigo" data-orc="recusar">Orçamento recusado</button>' +
      '</div>';
    const conteudo = document.getElementById('conteudo');
    conteudo.insertBefore(faixa, conteudo.firstChild);
    faixa.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-orc]');
      if (!b) return;
      if (b.dataset.orc === 'mensagem') abrirMensagem();
      if (b.dataset.orc === 'pdf') abrirPdf();
      if (b.dataset.orc === 'aprovar') aprovar();
      if (b.dataset.orc === 'recusar') recusar();
    });

    const dialogo = document.createElement('dialog');
    dialogo.id = 'dialogMensagemOrcamento';
    dialogo.className = 'dialog-tipos dialog-mensagem-orcamento';
    dialogo.innerHTML =
      '<h3>Mensagem do orçamento</h3>' +
      '<p class="resumo-mensagem">Confira e ajuste o texto antes de mandar.</p>' +
      '<textarea id="textoOrcamento" rows="16"></textarea>' +
      '<p class="dica-mensagem" id="dicaWhats"></p>' +
      '<div class="dialog-acoes">' +
        '<a id="linkWhatsOrcamento" class="botao-link sucesso" target="_blank" rel="noopener">Abrir no WhatsApp</a>' +
        '<button type="button" class="secundario" id="btnCopiarOrcamento">Copiar</button>' +
        '<button type="button" class="secundario" id="btnFecharOrcamento">Fechar</button>' +
      '</div>';
    document.body.appendChild(dialogo);
    const texto = dialogo.querySelector('#textoOrcamento');
    texto.addEventListener('input', atualizarLinkWhats);
    dialogo.querySelector('#btnFecharOrcamento').addEventListener('click', () => dialogo.close());
    dialogo.querySelector('#btnCopiarOrcamento').addEventListener('click', copiar);
  }

  // ---------- estado na tela ----------
  function atualizar(os) {
    const ficha = document.querySelector('.ficha');
    const liga = ativo(os);
    ficha.classList.toggle('modo-orcamento', liga);
    // A página inteira sabe do modo (faixa presa no alto, linhas marcadas).
    document.body.classList.toggle('em-orcamento', liga);
    const tipo = document.querySelector('.ficha-tipo');
    if (tipo) tipo.textContent = liga ? 'Orçamento' : tipoOriginal;
    document.getElementById('faixaOrcamento').classList.toggle('oculto', !liga);
    // O botão só aparece com a OS aberta (ou ainda não salva) e fora do modo.
    const podeLigar = !os.id || ['recepcao', 'execucao'].includes(os.status);
    document.getElementById('btnModoOrcamento').classList.toggle('oculto', liga || !podeLigar);
  }

  // ---------- ligar / aprovar ----------
  async function ligar() {
    let os = cfg.osAtual();
    const qtdPecas = (os.pecas || []).length;
    if (qtdPecas && !confirm('Colocar esta OS em modo orçamento?\n\nAs ' + qtdPecas +
        ' peça(s) já lançada(s) voltam para o estoque até o orçamento ser aprovado.')) return;
    try {
      await cfg.garantirOs();
      os = cfg.osAtual();
      const nova = await lerJson(await fetch('/api/ordens-servico/' + os.id + '/modo-orcamento', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: true }),
      }));
      cfg.aoMudar(nova, 'Modo orçamento ligado: as peças não saem do estoque até a aprovação.', 'ok');
    } catch (e) {
      cfg.aoMudar(null, e.message, 'erro');
    }
  }

  // Confere quem vai ficar com estoque negativo antes de baixar tudo.
  async function avisosDeEstoque(os) {
    const porItem = new Map();
    for (const p of os.pecas || []) {
      const atual = porItem.get(p.item_id) || { nome: p.nome, qtd: 0 };
      atual.qtd += Number(p.quantidade) || 0;
      porItem.set(p.item_id, atual);
    }
    const avisos = [];
    for (const [id, info] of porItem) {
      try {
        const item = await lerJson(await fetch('/api/itens/' + encodeURIComponent(id), { cache: 'no-store' }));
        const depois = Number(item.estoque) - info.qtd;
        if (depois < 0) avisos.push('• ' + info.nome + ': tem ' + item.estoque + ', sai ' + info.qtd + ' (fica ' + depois + ')');
      } catch (e) { /* sem conexão: o servidor avisa depois */ }
    }
    return avisos;
  }

  async function aprovar() {
    const os = cfg.osAtual();
    const pecas = os.pecas || [];
    const avisos = await avisosDeEstoque(os);
    let pergunta = 'Aprovar o orçamento?\n\n' + (pecas.length
      ? 'As ' + pecas.length + ' peça(s) saem do estoque agora e a OS volta ao normal.'
      : 'A OS volta ao normal.');
    if (avisos.length) pergunta += '\n\nATENÇÃO, ESTOQUE VAI FICAR NEGATIVO:\n' + avisos.join('\n');
    if (!confirm(pergunta)) return;
    try {
      const nova = await lerJson(await fetch('/api/ordens-servico/' + os.id + '/modo-orcamento', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: false }),
      }));
      cfg.aoMudar(nova, 'Orçamento aprovado: peças baixadas do estoque.' + (nova.aviso ? ' ' + nova.aviso : ''),
        nova.aviso ? 'erro' : 'ok');
    } catch (e) {
      cfg.aoMudar(null, e.message, 'erro');
    }
  }

  async function recusar() {
    const os = cfg.osAtual();
    if (!confirm('O cliente recusou o orçamento ' + os.codigo + '?\n\n' +
        'A OS será fechada e ficará no histórico em vermelho, como "Orçamento recusado". ' +
        'Nada sai do estoque. Se o cliente mudar de ideia, é só clicar em "Reabrir".')) return;
    try {
      const nova = await lerJson(await fetch('/api/ordens-servico/' + os.id + '/recusar-orcamento', { method: 'POST' }));
      cfg.aoMudar(nova, 'Orçamento recusado. A OS foi fechada e ficou no histórico.', 'ok');
    } catch (e) {
      cfg.aoMudar(null, e.message, 'erro');
    }
  }

  // ---------- mensagem e PDF ----------
  function montarTexto(os) {
    const linhas = ['*Auto Vidros Sport*', '*Orçamento nº ' + os.codigo + '*', ''];
    if (os.cliente_nome) linhas.push('Cliente: ' + os.cliente_nome);
    const veiculo = [os.marca, os.modelo, os.ano].filter(Boolean).join(' ');
    if (veiculo || os.placa) linhas.push('Veículo: ' + [veiculo, os.placa ? 'placa ' + os.placa : ''].filter(Boolean).join(' · '));
    const pecas = os.pecas || [];
    const servicos = os.servicos || [];
    let total = 0;
    if (pecas.length) {
      linhas.push('', '*Peças*');
      for (const p of pecas) {
        const qtd = Number(p.quantidade) || 0;
        const sub = qtd * Number(p.preco_unitario || 0);
        total += sub;
        linhas.push('• ' + qtd + 'x ' + p.nome + ' — ' + moeda(sub) + (qtd > 1 ? ' (' + moeda(p.preco_unitario) + ' cada)' : ''));
      }
    }
    if (servicos.length) {
      linhas.push('', '*Mão de obra*');
      for (const s of servicos) {
        total += Number(s.valor || 0);
        linhas.push('• ' + s.nome + ' — ' + moeda(s.valor));
      }
    }
    if (!pecas.length && !servicos.length) linhas.push('', '(nenhuma peça ou serviço lançado)');
    linhas.push('', '*Total: ' + moeda(total) + '*');
    return linhas.join('\n');
  }

  // Número do WhatsApp a partir do telefone (DDD + número).
  function numeroWhats(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return /^55\d{10,11}$/.test(d) ? d : '';
  }

  function atualizarLinkWhats() {
    const os = cfg.osAtual();
    const numero = numeroWhats(os.cliente_telefone);
    const texto = document.getElementById('textoOrcamento').value;
    document.getElementById('linkWhatsOrcamento').href =
      'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto);
    document.getElementById('dicaWhats').textContent = numero
      ? 'Abre a conversa com ' + os.cliente_nome + ' (' + os.cliente_telefone + ').'
      : 'O cliente não tem telefone no cadastro: o WhatsApp vai pedir para escolher o contato.';
  }

  function abrirMensagem() {
    const os = cfg.osAtual();
    document.getElementById('textoOrcamento').value = montarTexto(os);
    atualizarLinkWhats();
    document.getElementById('dialogMensagemOrcamento').showModal();
  }

  async function copiar() {
    const campo = document.getElementById('textoOrcamento');
    const botao = document.getElementById('btnCopiarOrcamento');
    try {
      // Pelo IP da rede (celular, outro PC) o navegador não libera a área de
      // transferência moderna: aí usa o jeito antigo.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(campo.value);
      } else {
        campo.select();
        document.execCommand('copy');
      }
      botao.textContent = 'Copiado!';
    } catch (e) {
      campo.select();
      botao.textContent = 'Selecionado: Ctrl+C';
    }
    setTimeout(() => { botao.textContent = 'Copiar'; }, 2000);
  }

  function abrirPdf() {
    const os = cfg.osAtual();
    window.open('/api/ordens-servico/' + os.id + '/orcamento.pdf', '_blank');
  }

  function iniciar(opcoes) {
    cfg = opcoes;
    montar();
  }

  window.ModoOrcamento = { iniciar, atualizar, ativo };
})();
