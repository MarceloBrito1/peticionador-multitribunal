(function initGraficos() {
  function renderResumoChart(container, porTipo) {
    if (!container) {
      return;
    }

    const entries = Object.entries(porTipo || {}).sort((a, b) => b[1] - a[1]);
    container.innerHTML = "";

    if (entries.length === 0) {
      const vazio = document.createElement("p");
      vazio.className = "muted";
      vazio.textContent = "Sem eventos para exibir no grafico.";
      container.appendChild(vazio);
      return;
    }

    const max = Math.max(...entries.map(([, value]) => value), 1);

    for (const [tipo, valor] of entries) {
      const row = document.createElement("div");
      row.className = "chart-row";

      const label = document.createElement("span");
      label.className = "chart-label";
      label.textContent = tipo;

      const bar = document.createElement("div");
      bar.className = "chart-bar";

      const fill = document.createElement("div");
      fill.className = "chart-fill";
      fill.style.width = `${Math.max(6, Math.round((valor / max) * 100))}%`;
      fill.textContent = String(valor);

      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);
      container.appendChild(row);
    }
  }

  window.graficos = {
    renderResumoChart,
  };
})();
