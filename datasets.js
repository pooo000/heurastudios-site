// The Datasets page (/datasets/): search, the topic filter and the previews.
// - Search keeps the sets whose card has every word typed (its title, what it does, its size, license and source,
//   and its topic's name); a topic shows only the sets it keeps, and a topic with none is put away.
// - The topics: All, or one topic (the chips are toggle buttons; one is pressed).
// - A card opens its set's preview as a modal dialog, and the address becomes /datasets/#<slug> so it can be shared;
//   opening the page at that address opens it. Close, Escape or a click beside it closes it, and the address goes back.
// Without this script every topic shows and a card's link makes its preview the page's target (datasets.css).
(function () {
  'use strict';
  var all = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var search = document.getElementById('ds-search');
  var shown = document.getElementById('ds-shown');
  var none = document.getElementById('ds-none');
  var chips = all('.ds-chip');
  var topics = all('.ds-topic').map(function (section) {
    var name = section.querySelector('.ds-topic-name').textContent;
    return {
      id: section.getAttribute('data-topic'), node: section,
      cards: all('.ds-card', section).map(function (card) {
        var words = [card.textContent, card.getAttribute('data-words') || '', name].join(' ');
        return { node: card, text: words.toLowerCase().replace(/\s+/g, ' ') };
      }),
    };
  });
  var total = topics.reduce(function (n, t) { return n + t.cards.length; }, 0);
  var topic = 'all';

  function apply() {
    var words = search ? search.value.toLowerCase().split(/\s+/).filter(Boolean) : [];
    var count = 0;
    topics.forEach(function (t) {
      var here = 0;
      t.cards.forEach(function (c) {
        var keep = (topic === 'all' || topic === t.id) && words.every(function (w) { return c.text.indexOf(w) >= 0; });
        c.node.hidden = !keep;
        if (keep) here += 1;
      });
      t.node.hidden = here === 0;
      count += here;
    });
    if (shown) shown.textContent = (count === total ? '' : count + ' of ') + total + ' datasets';
    if (none) none.hidden = count > 0;
  }

  function pick(id) {
    topic = id;
    chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-topic') === id)); });
    apply();
  }

  if (search) {
    search.addEventListener('input', apply);
    // "/" anywhere but a field goes to search, as on most catalogs
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.ds-preview[open]')) return;
      var at = document.activeElement;
      if (at && (at.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName))) return;
      e.preventDefault();
      search.focus();
    });
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () { pick(chip.getAttribute('data-topic')); });
  });
  var reset = document.querySelector('[data-reset]');
  if (reset) {
    reset.addEventListener('click', function () {
      if (search) search.value = '';
      pick('all');
      if (search) search.focus();
    });
  }
  if (search && search.value) apply();   // (a value the browser kept from before, going back to the page)

  // ---- the previews
  function previewAt(hash) {
    var id = '';
    try { id = decodeURIComponent((hash || '').slice(1)); } catch (e) { return null; }
    var el = id && document.getElementById(id);
    return el && el.classList.contains('ds-preview') && typeof el.showModal === 'function' ? el : null;
  }
  function open(dialog) {
    if (!dialog || dialog.open) return false;
    dialog.showModal();
    dialog.scrollTop = 0;
    if (location.hash !== '#' + dialog.id) history.replaceState(history.state, '', '#' + dialog.id);
    return true;
  }
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a.ds-open');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (open(previewAt(link.getAttribute('href')))) e.preventDefault();
  });
  function forget(dialog) {   // the address goes back to the page's own
    if (location.hash === '#' + dialog.id) history.replaceState(history.state, '', location.pathname + location.search);
  }
  all('.ds-preview').forEach(function (dialog) {
    var fromBackdrop = false;
    dialog.addEventListener('close', function () { forget(dialog); });   // (Escape and a click beside it, a moment later)
    // a click beside the sheet (on the backdrop) closes it, when it started there too (not a drag out of the text)
    dialog.addEventListener('pointerdown', function (e) { fromBackdrop = e.target === dialog; });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog && fromBackdrop) dialog.close();
      fromBackdrop = false;
    });
    var close = dialog.querySelector('.ds-close');
    if (close) close.addEventListener('click', function (e) { e.preventDefault(); forget(dialog); dialog.close(); });
  });
  open(previewAt(location.hash));
  window.addEventListener('hashchange', function () { open(previewAt(location.hash)); });
})();
