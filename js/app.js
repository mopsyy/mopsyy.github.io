/* ============================================================
   mopsy — browse page controller
   ============================================================ */

(function (Mopsy) {
  'use strict';

  var api = Mopsy.api;
  var ui = Mopsy.ui;
  var el = ui.el;

  var DEFAULT_SORT = 'relevance';
  var MIN_QUERY = 2;
  var MAX_PAGE = 100;          /* OMDb stops at 100 pages of 10 */

  var state = {
    view: 'home',              /* home | movie | series — which row set */
    type: 'movie',             /* movie | series — what search targets */
    query: '',
    year: '',
    sort: DEFAULT_SORT,
    page: 1,
    total: 0,
    items: [],                 /* everything loaded for the current search */
    mode: 'rows',              /* rows | grid */
    loading: false
  };

  var dom = {};
  var heroTimer = null;
  var heroItems = [];
  var heroIndex = 0;
  var heroStarted = false;

  /* ============================================================
     Boot
     ============================================================ */

  function cacheDom() {
    [
      'siteHeader', 'mainNav', 'menuBtn',
      'searchForm', 'searchInput', 'searchClear',
      'hero', 'heroImg', 'heroPoster', 'heroPosterBox', 'heroKicker', 'heroTitle',
      'heroMeta', 'heroOverview', 'heroWatch', 'heroInfo', 'heroDots',
      'typeSeg', 'yearSelect', 'sortSelect', 'filtersHint', 'resetFilters',
      'rows', 'results', 'resultsTitle', 'resultsCount', 'grid',
      'loadMore', 'emptyState',
      'modal', 'modalBody'
    ].forEach(function (id) { dom[id] = document.getElementById(id); });
  }

  function init() {
    cacheDom();
    buildYearOptions();
    bindChrome();
    bindFilters();
    bindSearch();
    bindModal();
    render();
  }

  /* ============================================================
     Chrome: header, nav, scroll
     ============================================================ */

  function bindChrome() {
    var onScroll = function () {
      dom.siteHeader.classList.toggle('is-stuck', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    dom.menuBtn.addEventListener('click', function () {
      var open = dom.mainNav.classList.toggle('is-open');
      dom.menuBtn.setAttribute('aria-expanded', String(open));
    });

    dom.mainNav.addEventListener('click', function (event) {
      var btn = event.target.closest('.nav-link');
      if (!btn) return;

      setView(btn.dataset.view);
      dom.mainNav.classList.remove('is-open');
      dom.menuBtn.setAttribute('aria-expanded', 'false');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function setView(view) {
    state.view = view;
    if (view === 'movie' || view === 'series') state.type = view;

    syncNav();
    syncTypeSeg();
    clearFilters();

    state.query = '';
    dom.searchInput.value = '';
    dom.searchClear.hidden = true;

    render();
  }

  function syncNav() {
    Array.prototype.forEach.call(dom.mainNav.children, function (btn) {
      btn.classList.toggle('is-active', btn.dataset.view === state.view);
    });
  }

  function syncTypeSeg() {
    Array.prototype.forEach.call(dom.typeSeg.children, function (btn) {
      btn.classList.toggle('is-active', btn.dataset.type === state.type);
    });
  }

  /* ============================================================
     Filters
     ------------------------------------------------------------
     OMDb only filters on type and year, and has no sort at all —
     so sorting runs over the results already on the page, and
     year/sort stay disabled until there is something to refine.
     ============================================================ */

  function buildYearOptions() {
    var now = new Date().getFullYear();
    var frag = document.createDocumentFragment();

    for (var y = now + 1; y >= 1950; y--) {
      var opt = el('option');
      opt.value = String(y);
      opt.textContent = String(y);
      frag.appendChild(opt);
    }
    dom.yearSelect.appendChild(frag);
  }

  function bindFilters() {
    dom.typeSeg.addEventListener('click', function (event) {
      var btn = event.target.closest('.seg-btn');
      if (!btn || btn.dataset.type === state.type) return;

      state.type = btn.dataset.type;
      syncTypeSeg();

      /* Browsing rows? Follow the switch in the top nav too. */
      if (state.mode === 'rows' && state.view !== 'home') {
        state.view = state.type;
        syncNav();
      }
      render();
    });

    dom.yearSelect.addEventListener('change', function () {
      state.year = dom.yearSelect.value;
      render();
    });

    dom.sortSelect.addEventListener('change', function () {
      state.sort = dom.sortSelect.value;
      dom.resetFilters.hidden = !filtersActive();
      renderGrid();                       /* sorting needs no new request */
    });

    dom.resetFilters.addEventListener('click', function () {
      clearFilters();
      render();
    });

    dom.loadMore.addEventListener('click', function () {
      loadGrid(state.page + 1, true);
    });
  }

  function clearFilters() {
    state.year = '';
    state.sort = DEFAULT_SORT;
    dom.yearSelect.value = '';
    dom.sortSelect.value = DEFAULT_SORT;
    dom.resetFilters.hidden = true;
  }

  function filtersActive() {
    return Boolean(state.year) || state.sort !== DEFAULT_SORT;
  }

  function syncFilterAvailability() {
    var searching = state.query.length >= MIN_QUERY;

    dom.yearSelect.disabled = !searching;
    dom.sortSelect.disabled = !searching;
    dom.filtersHint.hidden = searching;
    dom.resetFilters.hidden = !searching || !filtersActive();
  }

  /* ============================================================
     Search
     ============================================================ */

  function bindSearch() {
    var run = ui.debounce(commitSearch, 400);

    dom.searchInput.addEventListener('input', run);

    dom.searchForm.addEventListener('submit', function (event) {
      event.preventDefault();
      commitSearch();
    });

    dom.searchClear.addEventListener('click', function () {
      dom.searchInput.value = '';
      dom.searchInput.focus();
      commitSearch();
    });

    /* "/" focuses search, like the big streaming apps. */
    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && document.activeElement !== dom.searchInput) {
        event.preventDefault();
        dom.searchInput.focus();
      }
    });
  }

  function commitSearch() {
    var value = dom.searchInput.value.trim();
    if (value === state.query) return;

    state.query = value;
    dom.searchClear.hidden = !value;

    if (!value) clearFilters();
    render();
  }

  /* ============================================================
     Render dispatch
     ============================================================ */

  function render() {
    syncFilterAvailability();

    if (!state.query) {
      state.mode = 'rows';
      showRowsMode();
      loadRows();
      return;
    }

    state.mode = 'grid';
    showGridMode();

    if (state.query.length < MIN_QUERY) {
      state.items = [];
      dom.grid.innerHTML = '';
      dom.loadMore.hidden = true;
      dom.resultsTitle.textContent = 'Keep typing';
      dom.resultsCount.textContent = '';
      showMessage('OMDb needs at least ' + MIN_QUERY + ' characters to search.');
      return;
    }

    loadGrid(1, false);
  }

  function showGridMode() {
    dom.rows.hidden = true;
    dom.rows.innerHTML = '';
    dom.hero.hidden = true;
    stopHero();
    dom.results.hidden = false;
  }

  function showRowsMode() {
    dom.results.hidden = true;
    dom.grid.innerHTML = '';
    dom.loadMore.hidden = true;
    dom.emptyState.hidden = true;
    dom.rows.hidden = false;
  }

  function showMessage(text) {
    dom.emptyState.textContent = text;
    dom.emptyState.hidden = false;
  }

  /* OMDb's own wording is terse — soften the two we hit most. */
  function friendlyError(message) {
    if (/too many results/i.test(message)) return 'Too many matches — try a more specific title.';
    if (/not found/i.test(message)) return 'No titles matched. Try a different search.';
    return message || 'Something went wrong.';
  }

  /* ============================================================
     Rows (home / movies / series)
     ============================================================ */

  function loadRows() {
    var configs = api.rows[state.view] || api.rows.home;

    dom.rows.innerHTML = '';
    heroStarted = false;

    configs.forEach(function (config) {
      var row = buildRowShell(config.title);
      dom.rows.appendChild(row.node);

      api.search({ query: config.query, type: config.type, page: 1 })
        .then(function (data) {
          var items = ui.normalizeList(data.items)
            .filter(function (item) { return item.poster; });

          if (!items.length) {
            row.node.remove();
            return;
          }

          row.rail.innerHTML = '';
          items.forEach(function (item) {
            row.rail.appendChild(ui.card(item, openDetails));
          });
          row.syncNav();

          if (!heroStarted && items.length >= 3) {
            heroStarted = true;
            startHero(items);
          }
        })
        .catch(function () {
          /* One themed row missing shouldn't break the page. */
          row.node.remove();
          if (!dom.rows.children.length) {
            dom.results.hidden = false;
            dom.resultsTitle.textContent = 'Couldn’t reach OMDb';
            dom.resultsCount.textContent = '';
            showMessage('The catalogue is unavailable right now. Try again in a moment.');
          }
        });
    });
  }

  function buildRowShell(title) {
    var node = el('section', 'row');

    var head = el('div', 'row-head');
    head.appendChild(el('h2', 'row-title', ui.escapeHtml(title)));

    var nav = el('div', 'row-nav');
    var prev = el('button', null, ui.icons.left);
    var next = el('button', null, ui.icons.right);
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Scroll left');
    next.setAttribute('aria-label', 'Scroll right');
    nav.appendChild(prev);
    nav.appendChild(next);
    head.appendChild(nav);

    var rail = el('div', 'rail');
    rail.appendChild(ui.skeletons(7));

    node.appendChild(head);
    node.appendChild(rail);

    function step(direction) {
      rail.scrollBy({ left: direction * Math.round(rail.clientWidth * 0.82), behavior: 'smooth' });
    }
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });

    function syncNav() {
      var max = rail.scrollWidth - rail.clientWidth - 4;
      prev.disabled = rail.scrollLeft <= 4;
      next.disabled = rail.scrollLeft >= max;
    }
    rail.addEventListener('scroll', ui.debounce(syncNav, 120), { passive: true });

    return { node: node, rail: rail, syncNav: syncNav };
  }

  /* ============================================================
     Hero
     ------------------------------------------------------------
     OMDb has no landscape artwork, so the poster does double duty:
     blurred and blown up as ambience, and crisp beside the copy.
     ============================================================ */

  function startHero(items) {
    heroItems = items.slice(0, 5);
    if (!heroItems.length) {
      dom.hero.hidden = true;
      return;
    }

    heroIndex = 0;
    dom.hero.hidden = false;

    dom.heroDots.innerHTML = '';
    heroItems.forEach(function (item, index) {
      var dot = el('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Show ' + item.title);
      dot.addEventListener('click', function () { showHero(index); });
      dom.heroDots.appendChild(dot);
    });

    showHero(0);
    stopHero();
    heroTimer = setInterval(function () {
      showHero((heroIndex + 1) % heroItems.length);
    }, 9000);
  }

  function stopHero() {
    if (heroTimer) clearInterval(heroTimer);
    heroTimer = null;
  }

  function showHero(index) {
    var item = heroItems[index];
    if (!item) return;
    heroIndex = index;

    var art = api.poster(item.poster, Mopsy.config.IMG.large);

    dom.heroImg.classList.remove('is-in');
    dom.heroPoster.classList.remove('is-in');

    var preload = new Image();
    preload.onload = function () {
      if (heroItems[heroIndex] !== item) return;   /* slide moved on */
      dom.heroImg.src = art;
      dom.heroPoster.src = art;
      dom.heroPoster.alt = item.title + ' poster';
      dom.heroPosterBox.hidden = false;
      dom.heroImg.classList.add('is-in');
      dom.heroPoster.classList.add('is-in');
    };
    /* A few posters are dead links in OMDb's own data. */
    preload.onerror = function () {
      if (heroItems[heroIndex] !== item) return;
      dom.heroPosterBox.hidden = true;
    };
    preload.src = art;

    dom.heroKicker.textContent = item.type === 'series' ? 'Featured series' : 'Featured film';
    dom.heroTitle.textContent = item.title;
    dom.heroOverview.textContent = '';
    dom.heroMeta.innerHTML = heroMeta(item);

    dom.heroWatch.onclick = function () { ui.goWatch(item); };
    dom.heroInfo.onclick = function () { openDetails(item); };

    Array.prototype.forEach.call(dom.heroDots.children, function (dot, i) {
      dot.classList.toggle('is-active', i === index);
    });

    /* Plot and rating only exist on the lookup endpoint. */
    api.detail(item.id).then(function (raw) {
      if (heroItems[heroIndex] !== item) return;
      var full = ui.normalize(raw);
      dom.heroOverview.textContent = full.plot;
      dom.heroMeta.innerHTML = heroMeta(full);
    }).catch(function () { /* keep the basics */ });
  }

  function heroMeta(item) {
    var parts = [];
    if (item.rating) parts.push(ui.ratingPill(item.rating));
    if (item.year) parts.push('<span>' + ui.escapeHtml(item.year) + '</span>');
    if (item.runtime) parts.push('<span>' + ui.escapeHtml(item.runtime) + '</span>');
    parts.push('<span class="chip">' + ui.typeLabel(item.type) + '</span>');

    (item.genres || []).slice(0, 2).forEach(function (genre) {
      parts.push('<span class="chip">' + ui.escapeHtml(genre) + '</span>');
    });

    return parts.join('');
  }

  /* ============================================================
     Grid (search results)
     ============================================================ */

  function loadGrid(page, append) {
    if (state.loading) return;
    state.loading = true;

    if (!append) {
      state.items = [];
      dom.grid.innerHTML = '';
      dom.grid.appendChild(ui.skeletons(10));
      dom.emptyState.hidden = true;
      dom.loadMore.hidden = true;
      dom.resultsCount.textContent = '';
      dom.resultsTitle.textContent = 'Results for “' + state.query + '”';
    } else {
      dom.loadMore.textContent = 'Loading…';
      dom.loadMore.disabled = true;
    }

    api.search({
      query: state.query,
      type: state.type,
      year: state.year,
      page: page
    })
      .then(function (data) {
        state.page = page;
        state.total = data.total;

        var seen = {};
        state.items.forEach(function (item) { seen[item.id] = true; });

        ui.normalizeList(data.items).forEach(function (item) {
          if (seen[item.id]) return;          /* OMDb repeats across pages */
          seen[item.id] = true;
          state.items.push(item);
        });

        renderGrid();

        dom.resultsCount.textContent = state.total
          ? state.total.toLocaleString('en-US') + ' title' + (state.total === 1 ? '' : 's')
          : '';
      })
      .catch(function (err) {
        if (!append) {
          state.items = [];
          dom.grid.innerHTML = '';
          dom.loadMore.hidden = true;
          showMessage(friendlyError(err.message));
        } else {
          dom.loadMore.hidden = true;
        }
      })
      .finally(function () {
        state.loading = false;
        dom.loadMore.textContent = 'Load more';
        dom.loadMore.disabled = false;
      });
  }

  function renderGrid() {
    dom.grid.innerHTML = '';

    ui.sortItems(state.items, state.sort).forEach(function (item) {
      dom.grid.appendChild(ui.card(item, openDetails));
    });

    dom.emptyState.hidden = state.items.length > 0;
    dom.loadMore.hidden = state.items.length >= state.total || state.page >= MAX_PAGE;
  }

  /* ============================================================
     Details modal
     ============================================================ */

  function bindModal() {
    dom.modal.addEventListener('click', function (event) {
      if (event.target.hasAttribute('data-close')) closeModal();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !dom.modal.hidden) closeModal();
    });
  }

  function openDetails(item) {
    dom.modalBody.innerHTML = '<div class="loader"><span></span><span></span><span></span></div>';
    dom.modal.hidden = false;
    document.body.classList.add('no-scroll');

    api.detail(item.id)
      .then(renderDetails)
      .catch(function (err) {
        dom.modalBody.innerHTML =
          '<div class="modal-message"><h2>Couldn’t load that title</h2><p>' +
          ui.escapeHtml(friendlyError(err.message)) + '</p></div>';
      });
  }

  function closeModal() {
    dom.modal.hidden = true;
    dom.modalBody.innerHTML = '';
    document.body.classList.remove('no-scroll');
  }

  function renderDetails(raw) {
    var item = ui.normalize(raw);
    var art = api.poster(item.poster, Mopsy.config.IMG.large);
    var body = document.createDocumentFragment();

    /* ambient header made from the poster */
    var heroWrap = el('div', 'detail-hero');
    if (art) {
      var backdrop = el('img');
      backdrop.src = art;
      backdrop.alt = '';
      heroWrap.appendChild(backdrop);
    }
    body.appendChild(heroWrap);

    var wrap = el('div', 'detail-body');

    /* poster + headline */
    var top = el('div', 'detail-top');
    var posterBox = el('div', 'detail-poster');
    if (art) {
      var poster = el('img');
      poster.src = art;
      poster.alt = item.title + ' poster';
      posterBox.appendChild(poster);
    } else {
      posterBox.appendChild(el('span', 'no-art', 'No artwork'));
    }
    top.appendChild(posterBox);

    var headline = el('div', 'detail-headline');
    headline.appendChild(el('h2', 'detail-title', ui.escapeHtml(item.title)));

    var meta = [];
    if (item.rating) meta.push(ui.ratingPill(item.rating));
    if (item.year) meta.push('<span>' + ui.escapeHtml(item.year) + '</span>');
    if (item.runtime) meta.push('<span>' + ui.escapeHtml(item.runtime) + '</span>');
    if (item.rated) meta.push('<span class="chip">' + ui.escapeHtml(item.rated) + '</span>');
    meta.push('<span class="chip">' + ui.typeLabel(item.type) + '</span>');
    item.genres.forEach(function (genre) {
      meta.push('<span class="chip">' + ui.escapeHtml(genre) + '</span>');
    });

    headline.appendChild(el('div', 'detail-meta', meta.join('')));
    top.appendChild(headline);
    wrap.appendChild(top);

    /* actions */
    var actions = el('div', 'detail-actions');
    var watch = el('button', 'btn btn-primary', ui.icons.play + 'Watch now');
    watch.type = 'button';
    watch.addEventListener('click', function () { ui.goWatch(item); });
    actions.appendChild(watch);

    var imdb = el('a', 'btn btn-ghost', 'View on IMDb');
    imdb.href = 'https://www.imdb.com/title/' + item.id + '/';
    imdb.target = '_blank';
    imdb.rel = 'noopener';
    actions.appendChild(imdb);
    wrap.appendChild(actions);

    /* plot */
    if (item.plot) {
      var plot = el('div', 'detail-section');
      plot.appendChild(el('h3', null, 'Storyline'));
      plot.appendChild(el('p', 'detail-overview', ui.escapeHtml(item.plot)));
      wrap.appendChild(plot);
    }

    /* scores */
    var scores = (raw.Ratings || []).filter(function (score) { return score.Value; });
    if (scores.length) {
      var scoreSection = el('div', 'detail-section');
      scoreSection.appendChild(el('h3', null, 'Scores'));

      var scoreGrid = el('div', 'score-row');
      scores.forEach(function (score) {
        var cell = el('div', 'score');
        cell.appendChild(el('p', 'score-value', ui.escapeHtml(score.Value)));
        cell.appendChild(el('p', 'score-source', ui.escapeHtml(score.Source)));
        scoreGrid.appendChild(cell);
      });

      scoreSection.appendChild(scoreGrid);
      wrap.appendChild(scoreSection);
    }

    /* cast — OMDb gives names only, no photos */
    if (item.actors.length) {
      var castSection = el('div', 'detail-section');
      castSection.appendChild(el('h3', null, 'Cast'));

      var people = el('div', 'people');
      item.actors.forEach(function (person) {
        people.appendChild(el('span', 'person', ui.escapeHtml(person)));
      });

      castSection.appendChild(people);
      wrap.appendChild(castSection);
    }

    /* facts */
    var facts = buildFacts(raw, item);
    if (facts.length) {
      var factSection = el('div', 'detail-section');
      factSection.appendChild(el('h3', null, 'Details'));

      var grid = el('div', 'detail-facts');
      facts.forEach(function (fact) {
        var cell = el('div');
        cell.appendChild(el('p', 'fact-label', fact[0]));
        cell.appendChild(el('p', 'fact-value', ui.escapeHtml(fact[1])));
        grid.appendChild(cell);
      });

      factSection.appendChild(grid);
      wrap.appendChild(factSection);
    }

    body.appendChild(wrap);
    dom.modalBody.innerHTML = '';
    dom.modalBody.appendChild(body);
    dom.modal.querySelector('.modal-panel').scrollTop = 0;
  }

  function buildFacts(raw, item) {
    var na = ui.na;

    return [
      [item.type === 'series' ? 'First aired' : 'Released', na(raw.Released)],
      ['Seasons', na(raw.totalSeasons)],
      ['Director', na(raw.Director)],
      ['Writer', na(raw.Writer)],
      ['Language', na(raw.Language)],
      ['Country', na(raw.Country)],
      ['Box office', na(raw.BoxOffice)],
      ['IMDb votes', item.votes],
      ['Awards', na(raw.Awards)]
    ].filter(function (fact) { return fact[1]; });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.Mopsy);
