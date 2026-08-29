/* ============================================================
   mopsy — watch page
   ------------------------------------------------------------
   Reads ?type=movie|series&id=tt0111161 (plus &s=&e= for series)
   from the URL, mounts the player iframe, and fills in the
   surrounding detail from OMDb.
   ============================================================ */

(function (Mopsy) {
  'use strict';

  var api = Mopsy.api;
  var ui = Mopsy.ui;
  var cfg = Mopsy.config;
  var el = ui.el;

  var params = new URLSearchParams(window.location.search);
  var id = params.get('id');
  var fallbackTitle = params.get('title') || '';

  var state = {
    type: params.get('type') === 'series' ? 'series' : 'movie',
    title: fallbackTitle,
    season: Math.max(1, parseInt(params.get('s'), 10) || 1),
    episode: Math.max(1, parseInt(params.get('e'), 10) || 1),
    totalSeasons: 0
  };

  var dom = {};
  ['playerShell', 'playerBg', 'playerPlaceholder', 'playerHeading', 'playerNote',
   'nowPlaying', 'watchTitle', 'watchMeta', 'watchOverview',
   'episodesPanel', 'seasonSelect', 'episodeList',
   'aboutPanel', 'aboutPoster', 'aboutFacts'
  ].forEach(function (key) { dom[key] = document.getElementById(key); });

  var frame = null;

  /* ============================================================
     Player
     ============================================================ */

  function embedUrl() {
    if (state.type === 'series') {
      return cfg.EMBED_BASE + '/tv/' + id + '/' + state.season + '/' + state.episode;
    }
    return cfg.EMBED_BASE + '/movie/' + id;
  }

  function mountPlayer() {
    if (!frame) {
      frame = el('iframe', 'player-frame');
      frame.setAttribute('frameborder', '0');
      frame.setAttribute('allowfullscreen', '');
      frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
      dom.playerShell.appendChild(frame);
    }

    frame.title = state.title ? 'Playing ' + state.title : 'Player';
    frame.src = embedUrl();
    dom.playerPlaceholder.hidden = true;
  }

  function showPlaceholder(heading, note) {
    dom.playerHeading.textContent = heading;
    dom.playerNote.textContent = note;
    dom.playerPlaceholder.hidden = false;
  }

  /* Keeps the address bar shareable as the episode changes. */
  function syncUrl() {
    var next = 'watch.html?type=' + state.type + '&id=' + encodeURIComponent(id);
    if (state.type === 'series') next += '&s=' + state.season + '&e=' + state.episode;
    if (state.title) next += '&title=' + encodeURIComponent(state.title);

    window.history.replaceState(null, '', next);
  }

  /* ============================================================
     Title detail
     ============================================================ */

  function setPageTitle(name) {
    document.title = name ? name + ' — mopsy' : 'Watch — mopsy';
  }

  function renderFallback() {
    dom.watchTitle.textContent = state.title || 'Unknown title';
    dom.watchOverview.textContent = state.title
      ? 'Details are unavailable right now, but the player above is still loading this title.'
      : '';
    setPageTitle(state.title);
  }

  function renderDetail(raw) {
    var item = ui.normalize(raw);

    state.title = item.title;
    /* Trust the API over the URL if they disagree about the type. */
    if (item.type !== state.type) {
      state.type = item.type;
      mountPlayer();
    }

    dom.watchTitle.textContent = item.title;
    setPageTitle(item.title);
    if (frame) frame.title = 'Playing ' + item.title;

    var meta = [];
    if (item.rating) meta.push(ui.ratingPill(item.rating));
    if (item.year) meta.push('<span>' + ui.escapeHtml(item.year) + '</span>');
    if (item.runtime) meta.push('<span>' + ui.escapeHtml(item.runtime) + '</span>');

    var seasons = ui.na(raw.totalSeasons);
    if (seasons) {
      meta.push('<span>' + seasons + ' season' + (seasons === '1' ? '' : 's') + '</span>');
    }
    if (item.rated) meta.push('<span class="chip">' + ui.escapeHtml(item.rated) + '</span>');
    meta.push('<span class="chip">' + ui.typeLabel(item.type) + '</span>');

    item.genres.slice(0, 3).forEach(function (genre) {
      meta.push('<span class="chip">' + ui.escapeHtml(genre) + '</span>');
    });

    dom.watchMeta.innerHTML = meta.join('');
    dom.watchOverview.textContent = item.plot;

    var art = api.poster(item.poster, cfg.IMG.large);
    if (art) {
      var img = el('img');
      img.src = art;
      img.alt = '';
      dom.playerBg.appendChild(img);
    }

    if (state.type === 'series') {
      state.totalSeasons = parseInt(seasons, 10) || 1;
      setupSeasons();
    } else {
      renderAbout(raw, item, art);
    }

    syncUrl();
  }

  /* ============================================================
     About panel (movies — where series get their episode list)
     ============================================================ */

  function renderAbout(raw, item, art) {
    if (art) {
      var img = el('img');
      img.src = art;
      img.alt = item.title + ' poster';
      dom.aboutPoster.appendChild(img);
      dom.aboutPoster.hidden = false;
    }

    var na = ui.na;
    var facts = [
      ['Released', na(raw.Released)],
      ['Genre', na(raw.Genre)],
      ['Director', na(raw.Director)],
      ['Writer', na(raw.Writer)],
      ['Cast', na(raw.Actors)],
      ['Language', na(raw.Language)],
      ['Country', na(raw.Country)],
      ['Box office', na(raw.BoxOffice)],
      ['Awards', na(raw.Awards)]
    ].filter(function (fact) { return fact[1]; });

    dom.aboutFacts.innerHTML = '';
    facts.forEach(function (fact) {
      var row = el('div');
      row.appendChild(el('dt', null, ui.escapeHtml(fact[0])));
      row.appendChild(el('dd', null, ui.escapeHtml(fact[1])));
      dom.aboutFacts.appendChild(row);
    });

    dom.aboutPanel.hidden = false;
  }

  /* ============================================================
     Seasons and episodes
     ============================================================ */

  function setupSeasons() {
    dom.seasonSelect.innerHTML = '';

    for (var n = 1; n <= state.totalSeasons; n++) {
      var opt = el('option');
      opt.value = String(n);
      opt.textContent = 'Season ' + n;
      dom.seasonSelect.appendChild(opt);
    }

    if (state.season > state.totalSeasons) state.season = 1;
    dom.seasonSelect.value = String(state.season);

    dom.seasonSelect.addEventListener('change', function () {
      state.season = parseInt(dom.seasonSelect.value, 10) || 1;
      /* Start a newly picked season at its beginning rather than carrying
         the old episode number across. The initial load still honours &e=. */
      state.episode = 1;
      loadSeason();
    });

    dom.episodesPanel.hidden = false;
    loadSeason();
  }

  function loadSeason() {
    dom.episodeList.innerHTML = '<p class="episodes-empty">Loading episodes…</p>';

    api.season(id, state.season)
      .then(function (data) {
        var episodes = (data.Episodes || [])
          .map(function (raw) {
            return {
              number: parseInt(raw.Episode, 10),
              title: ui.na(raw.Title) || 'Untitled',
              released: ui.na(raw.Released),
              rating: ui.na(raw.imdbRating)
            };
          })
          .filter(function (ep) { return !isNaN(ep.number); })
          .sort(function (a, b) { return a.number - b.number; });

        if (!episodes.length) {
          dom.episodeList.innerHTML = '<p class="episodes-empty">No episodes listed for this season.</p>';
          return;
        }

        renderEpisodes(episodes);
      })
      .catch(function () {
        dom.episodeList.innerHTML =
          '<p class="episodes-empty">Couldn’t load this season’s episodes.</p>';
      });
  }

  function renderEpisodes(episodes) {
    /* A season switch can leave the chosen episode out of range. */
    var stillThere = episodes.some(function (ep) { return ep.number === state.episode; });
    if (!stillThere) state.episode = episodes[0].number;

    dom.episodeList.innerHTML = '';

    episodes.forEach(function (ep) {
      var node = el('button', 'episode');
      node.type = 'button';
      node.dataset.ep = String(ep.number);

      node.appendChild(el('span', 'episode-num', ep.number === 0 ? '—' : String(ep.number)));

      var body = el('span', 'episode-body');
      body.appendChild(el('span', 'episode-title', ui.escapeHtml(ep.title)));

      var bits = [];
      if (ep.released) bits.push(formatDate(ep.released));
      if (ep.rating) bits.push('★ ' + ep.rating);
      body.appendChild(el('span', 'episode-sub', bits.join(' · ')));
      node.appendChild(body);

      node.appendChild(el('span', 'episode-play', ui.icons.play));

      node.addEventListener('click', function () { playEpisode(ep); });

      if (ep.number === state.episode) node.classList.add('is-active');
      dom.episodeList.appendChild(node);
    });

    markNowPlaying(episodes);
    mountPlayer();
    syncUrl();
  }

  function playEpisode(ep) {
    state.episode = ep.number;

    Array.prototype.forEach.call(dom.episodeList.children, function (node) {
      node.classList.toggle('is-active', node.dataset.ep === String(ep.number));
    });

    setNowPlaying(ep);
    mountPlayer();
    syncUrl();

    dom.playerShell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function markNowPlaying(episodes) {
    var current = episodes.filter(function (ep) { return ep.number === state.episode; })[0];
    if (current) setNowPlaying(current);
  }

  function setNowPlaying(ep) {
    dom.nowPlaying.textContent =
      'Season ' + state.season + ' · Episode ' + ep.number + ' — ' + ep.title;
    dom.nowPlaying.hidden = false;
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date)) return value;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /* ============================================================
     Boot
     ============================================================ */

  if (!id) {
    showPlaceholder('Nothing selected', 'Pick a title from the browse page to start watching.');
    dom.watchTitle.textContent = 'Nothing selected';
    dom.watchOverview.textContent = 'Head back to browse and choose something to watch.';
    return;
  }

  /* The player only needs the IMDb id, so start it before OMDb answers. */
  mountPlayer();
  renderFallback();

  api.detail(id).then(renderDetail).catch(renderFallback);
})(window.Mopsy);
