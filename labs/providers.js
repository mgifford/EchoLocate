'use strict';

(function () {
  function renderList(hostId, kind) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.textContent = '';
    for (const provider of ProviderMetadata.listProviders(kind)) {
      const card = document.createElement('article');
      card.className = 'lab-lane';
      const title = document.createElement('h3');
      title.textContent = provider.label;
      const badge = document.createElement('p');
      badge.className = 'lab-badge';
      badge.textContent = provider.badge;
      const description = document.createElement('p');
      description.textContent = provider.description;
      const id = document.createElement('p');
      id.className = 'lab-status';
      id.textContent = provider.id;
      card.append(title, badge, description, id);
      host.appendChild(card);
    }
  }

  renderList('asr-providers', 'asr');
  renderList('translation-providers', 'translation');
})();
