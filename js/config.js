/* ============================================================
   mopsy — configuration
   ------------------------------------------------------------
   mopsy is a fully static site: it calls the OMDb API directly
   from the browser. There is no backend, so the key below ships
   with the page — use a throwaway/free key only.

   Get your own at https://www.omdbapi.com/apikey.aspx
   ============================================================ */

window.Mopsy = window.Mopsy || {};

Mopsy.config = {
  /* OMDb API key (free tier: 1,000 requests/day). */
  OMDB_API_KEY: '34f88987',

  API_BASE: 'https://www.omdbapi.com/',

  /* Player embeds, keyed by IMDb id:
       movies  ->  <EMBED_BASE>/movie/tt4154796
       series  ->  <EMBED_BASE>/tv/tt0944947/<season>/<episode>   */
  EMBED_BASE: 'https://videm.xyz/embed',

  /* Poster widths — OMDb serves one portrait image we can resize. */
  IMG: {
    card: 300,
    large: 600
  },

  /* Responses are cached in localStorage to stay under the daily quota. */
  CACHE_KEY: 'mopsy:cache',
  CACHE_TTL: 24 * 60 * 60 * 1000,
  CACHE_MAX: 250
};
