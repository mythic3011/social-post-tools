/* Settings page renderer. Classic script (CSP script-src 'self').
   Depends on SPT.store. Runs only on data-page="settings". */
(() => {
  'use strict';
  const Core = globalThis.SocialPostCore;
  const SPT = (globalThis.SPT = globalThis.SPT || {});
  if (!Core || !SPT.store) return;

  const { ACTIONS, DEFAULTS, clone, loadSettings, saveSettings, compatible } = SPT.store;
  const $ = (id) => document.getElementById(id);
  const status = (text) => { if ($('status')) $('status').textContent = text || ''; };

  function builderDisplayLabel(builder) {
    if (!builder) return '';
    if (!builder.builtin) return `${builder.name} — custom`;
    if (builder.group === 'Nitter') return `${builder.name} — alternative reader`;
    if (builder.group === 'Embed fixer') return `${builder.name} — better chat previews`;
    if (builder.id === 'vxthreads') return `${builder.name} — better chat previews`;
    return builder.name;
  }

  function optionSelect(select, builders, selectedId) {
    select.replaceChildren();
    for (const builder of builders) {
      const option = document.createElement('option');
      option.value = builder.id;
      option.textContent = builderDisplayLabel(builder);
      option.selected = builder.id === selectedId;
      select.append(option);
    }
  }

  function renderSettingsPage() {
    let draft = loadSettings();
    optionSelect($('x-builder'), compatible('x', draft), draft.links.x.builderId);
    optionSelect($('threads-builder'), compatible('threads', draft), draft.links.threads.builderId);

    const checks = $('action-checks');
    for (const [id, label] of ACTIONS) {
      const input = document.createElement('input');
      input.type = 'checkbox'; input.checked = draft.actions.enabled[id] !== false; input.dataset.action = id;
      const wrap = document.createElement('label'); wrap.append(input, document.createTextNode(label)); checks.append(wrap);
    }
    $('share-link-source').value = draft.share.linkSource;
    $('share-template').value = draft.share.template;
    if ($('android-capture-browser')) $('android-capture-browser').value = draft.capture.androidBrowser;

    function refreshBuilderList() {
      const list = $('builder-list'); list.replaceChildren();
      if (!draft.builders.custom.length) {
        const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No custom builders.'; list.append(p); return;
      }
      for (const builder of draft.builders.custom) {
        const row = document.createElement('div'); row.className = 'builder-item';
        const label = document.createElement('div');
        const strong = document.createElement('strong'); strong.textContent = builder.name;
        const detail = document.createElement('div'); detail.className = 'url muted'; detail.textContent = builder.baseUrl || builder.template || '';
        label.append(strong, detail);
        const del = document.createElement('button'); del.type = 'button'; del.className = 'secondary outline'; del.textContent = 'Delete';
        del.addEventListener('click', () => {
          draft.builders.custom = draft.builders.custom.filter((item) => item.id !== builder.id);
          for (const p of ['x', 'threads']) if (draft.links[p].builderId === builder.id) draft.links[p].builderId = DEFAULTS.links[p].builderId;
          refreshAllSelects(); refreshBuilderList();
        });
        row.append(label, del); list.append(row);
      }
    }

    function refreshAllSelects() {
      optionSelect($('x-builder'), compatible('x', draft), draft.links.x.builderId);
      optionSelect($('threads-builder'), compatible('threads', draft), draft.links.threads.builderId);
    }

    function previewBuilder() {
      const platform = $('builder-platform').value;
      const type = $('builder-type').value;
      const value = $('builder-value').value.trim();
      const raw = { id: 'preview', name: $('builder-name').value || 'Preview', platforms: [platform], type };
      if (type === 'replace-origin') raw.baseUrl = value; else raw.template = value;
      const builder = Core.normalizeCustomBuilder(raw, { allowInsecureHttp: draft.security.allowInsecureCustomUrls });
      const sample = platform === 'x' ? 'https://x.com/example/status/1234567890' : 'https://www.threads.com/@example/post/AbCdEf';
      $('builder-preview').textContent = builder ? (Core.buildUrl(builder, platform, sample, { allowInsecureHttp: draft.security.allowInsecureCustomUrls }) || 'Invalid output') : 'Invalid builder';
    }
    for (const id of ['builder-name', 'builder-platform', 'builder-type', 'builder-value']) $(id).addEventListener('input', previewBuilder);
    $('builder-type').addEventListener('change', previewBuilder);
    $('builder-add').addEventListener('click', () => {
      const platform = $('builder-platform').value;
      const type = $('builder-type').value;
      const raw = { name: $('builder-name').value, platforms: [platform], type };
      if (type === 'replace-origin') raw.baseUrl = $('builder-value').value; else raw.template = $('builder-value').value;
      const builder = Core.normalizeCustomBuilder(raw, { allowInsecureHttp: draft.security.allowInsecureCustomUrls });
      if (!builder || draft.builders.custom.length >= Core.MAX_CUSTOM_BUILDERS) { status('Invalid builder. HTTPS is required except loopback.'); return; }
      draft.builders.custom.push(builder); $('builder-name').value = ''; $('builder-value').value = ''; previewBuilder(); refreshAllSelects(); refreshBuilderList(); status('Builder added to draft settings.');
    });

    $('portable-export').addEventListener('click', () => {
      draft.links.x.builderId = $('x-builder').value; draft.links.threads.builderId = $('threads-builder').value;
      $('portable-json').value = JSON.stringify(Core.makePortableLinkSettings(draft), null, 2);
      status('Portable link settings exported.');
    });
    $('portable-import').addEventListener('click', () => {
      try {
        const portable = Core.sanitizePortableLinkSettings(JSON.parse($('portable-json').value));
        if (!portable) throw new Error('bad schema');
        draft.links = portable.links; draft.builders.custom = portable.builders.custom; draft.security.allowInsecureCustomUrls = portable.security.allowInsecureCustomUrls;
        refreshAllSelects(); refreshBuilderList(); status('Portable link settings imported into the draft.');
      } catch { status('Invalid portable settings JSON.'); }
    });
    $('settings-reset').addEventListener('click', () => {
      draft = clone(DEFAULTS); refreshAllSelects(); refreshBuilderList(); $('share-link-source').value = draft.share.linkSource; $('share-template').value = draft.share.template; if ($('android-capture-browser')) $('android-capture-browser').value = draft.capture.androidBrowser;
      for (const input of checks.querySelectorAll('input[data-action]')) input.checked = draft.actions.enabled[input.dataset.action] !== false;
      status('Settings reset in the draft.');
    });
    $('settings-save').addEventListener('click', () => {
      draft.links.x.builderId = $('x-builder').value; draft.links.threads.builderId = $('threads-builder').value;
      draft.share.linkSource = $('share-link-source').value; draft.share.template = $('share-template').value; if ($('android-capture-browser')) draft.capture.androidBrowser = $('android-capture-browser').value;
      for (const input of checks.querySelectorAll('input[data-action]')) draft.actions.enabled[input.dataset.action] = input.checked;
      draft = saveSettings(draft); status('Saved.');
    });
    refreshBuilderList(); previewBuilder();
  }

  SPT.pages = SPT.pages || {};
  SPT.pages.settings = renderSettingsPage;
})();
