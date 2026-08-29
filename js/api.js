/* ============================================================
   mopsy — OMDb API layer
   ------------------------------------------------------------
   OMDb only does two things: search titles by keyword (10 per
   page) and look a title up by its IMDb id. Everything the app
   shows is built out of those two calls, so responses are
   cached in memory and in localStorage to protect the daily
   request quota.
   ============================================================ */

(function (Mopsy) {
  'use strict';

  var cfg = Mopsy.config;
  var memory = new Map();

  /* ---- persistent cache -------------------------------------------- */

  var disk = (function load() {
    try {
      var raw = localStorage.getItem(cfg.CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  })();

  function cacheRead(url) {
    if (memory.has(url)) return memory.get(url);

    var entry = disk[url];
    if (!entry) return null;

    if (Date.now() - entry.t > cfg.CACHE_TTL) {
      delete disk[url];
      return null;
    }

    memory.set(url, entry.d);
    return entry.d;
  }

  function cacheWrite(url, data) {
    memory.set(url, data);
    disk[url] = { t: Date.now(), d: data };

    var urls = Object.keys(disk);
    if (urls.length > cfg.CACHE_MAX) {
      urls.sort(function (a, b) { return disk[a].t - disk[b].t; })
        .slice(0, urls.length - cfg.CACHE_MAX)
        .forEach(function (old) { delete disk[old]; });
    }

    try {
      localStorage.setItem(cfg.CACHE_KEY, JSON.stringify(disk));
    } catch (e) {
      /* Storage full or blocked — the in-memory cache still works. */
      disk = {};
    }
  }

  /* ---- low level ---------------------------------------------------- */

  function ApiError(message) {
    this.name = 'ApiError';
    this.message = message;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function buildUrl(params) {
    var url = new URL(cfg.API_BASE);
    url.searchParams.set('apikey', cfg.OMDB_API_KEY);

    Object.keys(params || {}).forEach(function (name) {
      var value = params[name];
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(name, value);
    });

    return url.toString();
  }

  function request(params) {
    var url = buildUrl(params);

    var cached = cacheRead(url);
    if (cached) return Promise.resolve(cached);

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new ApiError('OMDb request failed (' + res.status + ').');
        return res.json();
      })
      .then(function (data) {
        /* OMDb answers with HTTP 200 even for misses. */
        if (data.Response === 'False') throw new ApiError(data.Error || 'Nothing found.');
        cacheWrite(url, data);
        return data;
      })
      .catch(function (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError('Could not reach OMDb. Check your connection.');
      });
  }

  /* ---- images -------------------------------------------------------- */

  /* OMDb hands back one Amazon poster URL with the resize instructions baked
     into the path, in a couple of different shapes — some carry a crop box
     that pins the image to its original width. Rebuilding the whole tail is
     the only reliable way to ask for a bigger version. */
  function poster(url, width) {
    if (!url || url === 'N/A') return '';
    if (url.indexOf('._V1_') === -1) return url;
    return url.replace(/\._V1_.*$/i, '._V1_SX' + (width || cfg.IMG.card) + '.jpg');
  }

  /* ---- curated rows ---------------------------------------------------
     OMDb has no "popular" or "trending" endpoint, so the home rows are
     keyword searches picked to read like editorial collections. */

  var rows = {
    home: [
      { title: 'The Marvel universe',  query: 'marvel',            type: 'movie' },
      { title: 'A galaxy far away',    query: 'star wars',         type: 'movie' },
      { title: 'Crime and mystery',    query: 'murder',            type: 'series' },
      { title: 'Caped crusaders',      query: 'batman',            type: 'movie' },
      { title: 'Into the dark',        query: 'dark',              type: 'series' },
      { title: 'Middle-earth & magic', query: 'lord of the rings', type: 'movie' }
    ],
    movie: [
      { title: 'The Marvel universe',  query: 'marvel',        type: 'movie' },
      { title: 'A galaxy far away',    query: 'star wars',     type: 'movie' },
      { title: 'Caped crusaders',      query: 'batman',        type: 'movie' },
      { title: 'The wizarding world',  query: 'harry potter',  type: 'movie' },
      { title: 'Fast and loud',        query: 'fast',          type: 'movie' },
      { title: 'Mission critical',     query: 'mission',       type: 'movie' },
      { title: 'Love stories',         query: 'love',          type: 'movie' }
    ],
    series: [
      { title: 'Into the dark',        query: 'dark',    type: 'series' },
      { title: 'True crime',           query: 'murder',  type: 'series' },
      { title: 'Star-studded',         query: 'star',    type: 'series' },
      { title: 'City lives',           query: 'city',    type: 'series' },
      { title: 'Love and drama',       query: 'love',    type: 'series' },
      { title: 'After dark',           query: 'night',   type: 'series' }
    ]
  };

  Mopsy.api = {
    ApiError: ApiError,
    rows: rows,
    poster: poster,

    clearCache: function () {
      memory.clear();
      disk = {};
      try { localStorage.removeItem(cfg.CACHE_KEY); } catch (e) { /* ignore */ }
    },

    /* OMDb pages are fixed at 10 results, capped at page 100. */
    pageSize: 10,

    search: function (opts) {
      return request({
        s: opts.query,
        type: opts.type || '',
        y: opts.year || '',
        page: opts.page || 1
      }).then(function (data) {
        return {
          items: data.Search || [],
          total: Math.min(parseInt(data.totalResults, 10) || 0, 1000)
        };
      });
    },

    detail: function (imdbID) {
      return request({ i: imdbID, plot: 'full' });
    },

    /* Episode list for one season of a series. */
    season: function (imdbID, season) {
      return request({ i: imdbID, Season: season });
    }
  };
})(window.Mopsy);
