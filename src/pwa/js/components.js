/* Shared UI components as classic-script custom elements (CSP script-src
   'self': no modules, no inline scripts, no innerHTML on pages). Each element
   builds its subtree with DOM APIs. Attributes configure per-page content.

   <spt-header title="..." eyebrow="..." home-href="./" settings-href="./settings.html"
               github-href="..." brand>
   <spt-footer version="..."> with default project-links nav.
   <spt-install-dialog> the shared install dialog + diagnostics.
*/
(() => {
  'use strict';
  const SPT = (globalThis.SPT = globalThis.SPT || {});

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function link(href, className, text, opts = {}) {
    const a = el('a', className, text);
    a.href = href;
    if (opts.roleButton) a.setAttribute('role', 'button');
    if (opts.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }

  class SptHeader extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered) return;
      this.dataset.rendered = '1';
      const title = this.getAttribute('title') || 'Social Post Tools';
      const eyebrow = this.getAttribute('eyebrow') || '';
      const brand = this.hasAttribute('brand');
      const header = el('header', 'spt-header' + (brand ? ' site-header' : ''));

      const brandBlock = el('div', 'brand-block');
      if (brand) {
        const mark = el('span', 'product-mark', 'SP');
        mark.setAttribute('aria-hidden', 'true');
        brandBlock.append(mark);
      }
      const titleWrap = el('div');
      titleWrap.append(el('h1', null, title));
      if (eyebrow) titleWrap.append(el('p', 'eyebrow', eyebrow));
      brandBlock.append(titleWrap);
      header.append(brandBlock);

      const actions = el('nav', 'header-actions');
      actions.setAttribute('aria-label', 'Primary navigation');
      // Extra text links: links="./a.html|A,./b.html|B"
      const extra = this.getAttribute('links');
      if (extra) {
        for (const pair of extra.split(',')) {
          const [href, text] = pair.trim().split('|');
          if (href && text) actions.append(link(href, 'text-link', text));
        }
      }
      const github = this.getAttribute('github-href');
      if (github) actions.append(link(github, 'text-link', 'GitHub ↗', { external: true }));
      const home = this.getAttribute('home-href');
      if (home) actions.append(link(home, 'secondary outline compact', 'Home', { roleButton: true }));
      const settings = this.getAttribute('settings-href');
      if (settings) actions.append(link(settings, 'secondary outline compact', 'Settings', { roleButton: true }));
      if (actions.children.length) header.append(actions);

      this.append(header);
    }
  }

  class SptFooter extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered) return;
      this.dataset.rendered = '1';
      const version = this.getAttribute('version') || '';
      const footer = el('footer', 'app-footer');
      const nav = el('nav', 'footer-nav');
      nav.setAttribute('aria-label', 'Project links');
      const links = this.getAttribute('links');
      const items = links
        ? links.split(',').map((pair) => pair.trim().split('|'))
        : [['./link-lab.html', 'Link Lab'], ['./settings.html', 'Settings'], ['./install.html', 'Install'], ['./privacy.html', 'Privacy & security']];
      for (const [href, text] of items) if (href && text) nav.append(link(href, null, text));
      footer.append(nav);
      if (version) footer.append(el('p', 'build-info', `Version ${version}`));
      this.append(footer);
    }
  }

  class SptInstallDialog extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered) return;
      this.dataset.rendered = '1';
      const dialog = el('dialog', 'install-dialog');
      dialog.id = 'install-dialog';
      dialog.setAttribute('aria-labelledby', 'install-dialog-title');
      const article = el('article');
      const head = el('header');
      const h2 = el('h2', null, 'Install Social Post Tools');
      h2.id = 'install-dialog-title';
      head.append(h2);
      article.append(head);

      const guidance = el('p', null);
      guidance.id = 'install-guidance';
      guidance.append(
        document.createTextNode('Open your browser menu, then choose '),
        el('strong', null, 'Install app'),
        document.createTextNode(' or '),
        el('strong', null, 'Add to Home screen'),
        document.createTextNode('.'),
      );
      article.append(guidance);
      article.append(el('p', 'muted', 'The native prompt is browser-dependent. Manual installation can still work when the page cannot trigger it directly.'));

      const details = el('details', 'install-diagnostics');
      details.append(el('summary', null, 'Installation diagnostics'));
      const dl = el('dl');
      const rows = [
        ['HTTPS', 'diag-secure'],
        ['Service worker', 'diag-worker'],
        ['Native prompt', 'diag-prompt'],
        ['App mode', 'diag-mode'],
      ];
      if (this.hasAttribute('share-target-diag')) rows.push(['Share target', 'diag-share-target']);
      for (const [term, id] of rows) {
        const wrap = el('div');
        wrap.append(el('dt', null, term));
        const dd = el('dd', null, 'Checking…');
        dd.id = id;
        wrap.append(dd);
        dl.append(wrap);
      }
      details.append(dl);
      article.append(details);

      const foot = el('footer', 'toolbar');
      const close = el('button', 'secondary', 'Close');
      close.type = 'button';
      close.id = 'install-dialog-close';
      foot.append(close);
      article.append(foot);
      dialog.append(article);
      this.append(dialog);
    }
  }

  function define(name, ctor) {
    if (!customElements.get(name)) customElements.define(name, ctor);
  }
  define('spt-header', SptHeader);
  define('spt-footer', SptFooter);
  define('spt-install-dialog', SptInstallDialog);

  SPT.components = { SptHeader, SptFooter, SptInstallDialog };
})();
