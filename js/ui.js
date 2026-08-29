/* ============================================================
   mopsy — UI helpers
   DOM building blocks shared by the browse page and watch page.
   ============================================================ */

(function (Mopsy) {
  'use strict';

  var api = Mopsy.api;
  var IMG = Mopsy.config.IMG;

  /* ---- tiny DOM helper -------------------------------------------- */

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  var icons = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.1v13.8c0 .8.9 1.3 1.6.9l11-6.9a1 1 0 0 0 0-1.7l-11-6.9A1 1 0 0 0 8 5.1Z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9L12 2.6Z"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 4.6 8 12l7.4 7.4 1.4-1.4L10.8 12l6-6-1.4-1.4Z"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 4.6 7.2 6l6 6-6 6 1.4 1.4L16 12 8.6 4.6Z"/></svg>'
  };

  /* ---- data shaping ------------------------------------------------ */

  /* OMDb writes "N/A" wherever it has no value. */
  function na(value) {
    if (!value || value === 'N/A') return '';
    return String(value);
  }

  function splitList(value) {
    return na(value)
      .split(',')
      .map(function (part) { return part.trim(); })
      .filter(Boolean);
  }

  /* Search hits and full lookups share these fields, so one shape
     covers both; lookup-only extras are read straight off the raw
     response by the detail renderer. */
  function normalize(raw) {
    if (!raw || !raw.imdbID) return null;

    var year = na(raw.Year);

    return {
      id: raw.imdbID,
      type: raw.Type === 'series' ? 'series' : 'movie',
      title: na(raw.Title) || 'Untitled',
      year: year,
      startYear: parseInt(year, 10) || 0,
      poster: na(raw.Poster),
      rating: parseFloat(raw.imdbRating) || 0,
      votes: na(raw.imdbVotes),
      plot: na(raw.Plot),
      runtime: na(raw.Runtime),
      rated: na(raw.Rated),
      genres: splitList(raw.Genre),
      actors: splitList(raw.Actors)
    };
  }

  function normalizeList(results) {
    return (results || []).map(normalize).filter(Boolean);
  }

  function typeLabel(type) {
    return type === 'series' ? 'Series' : 'Film';
  }

  /* ---- client-side sorting -------------------------------------------
     OMDb has no sort parameter, so sorting happens over whatever the
     page has already loaded. */

  function sortItems(items, mode) {
    var sorted = items.slice();

    if (mode === 'title.asc') {
      sorted.sort(function (a, b) { return a.title.localeCompare(b.title); });
    } else if (mode === 'year.desc') {
      sorted.sort(function (a, b) { return b.startYear - a.startYear; });
    } else if (mode === 'year.asc') {
      sorted.sort(function (a, b) { return a.startYear - b.startYear; });
    }

    return sorted;
  }

  /* ---- lazy images -------------------------------------------------- */

  var lazyObserver = null;

  if ('IntersectionObserver' in window) {
    lazyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var node = entry.target;
        lazyObserver.unobserve(node);
        node.src = node.dataset.src;
      });
    }, { rootMargin: '250px 0px' });
  }

  function lazyImage(src, alt) {
    var node = el('img');
    node.alt = alt || '';
    node.loading = 'lazy';
    node.decoding = 'async';
    node.addEventListener('load', function () { node.classList.add('is-in'); });
    node.addEventListener('error', function () {
      var holder = node.parentNode;
      if (holder) {
        node.remove();
        holder.appendChild(el('span', 'no-art', 'No artwork'));
      }
    });

    if (lazyObserver) {
      node.dataset.src = src;
      lazyObserver.observe(node);
    } else {
      node.src = src;
    }
    return node;
  }

  /* ---- links -------------------------------------------------------- */

  function watchUrl(item) {
    return 'watch.html?type=' + encodeURIComponent(item.type) +
           '&id=' + encodeURIComponent(item.id) +
           '&title=' + encodeURIComponent(item.title);
  }

  function goWatch(item) {
    window.location.href = watchUrl(item);
  }

  /* ---- cards --------------------------------------------------------- */

  /* onOpen fires when the poster (not the WATCH button) is clicked. */
  function card(item, onOpen) {
    var node = el('article', 'card');
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', item.title + ' — open details');

    var posterBox = el('div', 'card-poster');
    if (item.poster) {
      posterBox.appendChild(lazyImage(api.poster(item.poster, IMG.card), item.title + ' poster'));
    } else {
      posterBox.appendChild(el('span', 'no-art', 'No artwork'));
    }

    posterBox.appendChild(el('span', 'card-type', typeLabel(item.type)));

    var overlay = el('div', 'card-overlay');
    var watch = el('button', 'watch-btn', icons.play + '<span>Watch</span>');
    watch.type = 'button';
    watch.addEventListener('click', function (event) {
      event.stopPropagation();
      goWatch(item);
    });
    overlay.appendChild(watch);
    posterBox.appendChild(overlay);

    var info = el('div', 'card-info');
    info.appendChild(el('h3', 'card-title', escapeHtml(item.title)));
    info.appendChild(el('p', 'card-sub', [item.year, typeLabel(item.type)].filter(Boolean).join(' · ')));

    node.appendChild(posterBox);
    node.appendChild(info);

    function open() { if (onOpen) onOpen(item); }
    node.addEventListener('click', open);
    node.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    return node;
  }

  function skeletons(count) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var node = el('div', 'card skeleton');
      node.appendChild(el('div', 'card-poster'));
      node.appendChild(el('div', 'card-info', '<h3 class="card-title">&nbsp;</h3>'));
      frag.appendChild(node);
    }
    return frag;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---- misc ---------------------------------------------------------- */

  function ratingPill(value) {
    return '<span class="rating-pill">' + icons.star + value.toFixed(1) + '</span>';
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  Mopsy.ui = {
    el: el,
    icons: icons,
    na: na,
    splitList: splitList,
    normalize: normalize,
    normalizeList: normalizeList,
    typeLabel: typeLabel,
    sortItems: sortItems,
    lazyImage: lazyImage,
    watchUrl: watchUrl,
    goWatch: goWatch,
    card: card,
    skeletons: skeletons,
    escapeHtml: escapeHtml,
    ratingPill: ratingPill,
    debounce: debounce
  };
})(window.Mopsy);
