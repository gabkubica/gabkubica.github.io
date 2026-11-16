// Demonstração. Gerado por scripts/demo/montar.js.
(function () {
  var sw = navigator.serviceWorker;
  function aviso(txt) {
    var f = function () {
      var d = document.getElementById('demo-carregando');
      if (!d) {
        d = document.createElement('div');
        d.id = 'demo-carregando';
        d.style.cssText = 'position:fixed;inset:0;z-index:100001;background:#18181b;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font:600 18px system-ui,sans-serif;line-height:1.5';
        document.body.appendChild(d);
      }
      d.innerHTML = txt;
    };
    if (document.body) f(); else document.addEventListener('DOMContentLoaded', f);
  }
  if (!sw) { aviso('Esta demonstração precisa de um navegador atualizado (Chrome, Edge, Firefox ou Safari).'); return; }
  var recarregando = false;
  sw.addEventListener('controllerchange', function () {
    if (recarregando) return;
    recarregando = true;
    fetch('/__demo/pronto').then(function () { location.reload(); }, function () { location.reload(); });
  });
  if (!sw.controller) {
    aviso('Preparando a demonstração…<br><small style="font-weight:400;opacity:.8">Só na primeira visita: o sistema está sendo carregado no seu navegador (uns 15 MB).</small>');
    sw.register('/sw.js').then(function () { return sw.ready; }).then(function (reg) {
      if (!sw.controller && reg.active) reg.active.postMessage('assumir');
    }).catch(function (e) { aviso('Não foi possível iniciar a demonstração: ' + e.message); });
    return;
  }
  sw.register('/sw.js');
  setInterval(function () { fetch('/__demo/ping').catch(function () {}); }, 20000);

  function selo() {
    if (document.getElementById('demo-selo')) return;
    var s = document.createElement('div');
    s.id = 'demo-selo';
    s.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:100000;background:#f5b301;color:#18181b;' +
      'padding:6px 8px 6px 12px;border-radius:999px;font:700 12px system-ui,sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.25);display:flex;gap:8px;align-items:center';
    s.innerHTML = '<span title="Pode criar, editar e apagar à vontade: tudo fica só neste navegador. Modo Gerenciador: qualquer usuário e senha.">DEMONSTRAÇÃO · dados de exemplo · só neste navegador</span>' +
      '<button type="button" style="all:unset;cursor:pointer;background:#18181b;color:#f5b301;border-radius:999px;padding:2px 9px;font:700 11px system-ui,sans-serif">Restaurar exemplo</button>';
    s.querySelector('button').onclick = function () {
      if (!confirm('Voltar aos dados de exemplo? Tudo o que você mudou nesta demonstração será apagado.')) return;
      this.textContent = 'Restaurando…';
      fetch('/__demo/restaurar').then(function () { location.reload(); });
    };
    document.body.appendChild(s);
  }
  if (document.body) selo(); else document.addEventListener('DOMContentLoaded', selo);
})();
