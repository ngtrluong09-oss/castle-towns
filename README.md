# 城下町アトラス · Castle town explorer (static site)

Open `index.html` over HTTP (`python3 -m http.server` in this folder); `fetch` does not work from `file://`.
All paths are relative, so the folder can be published as-is on GitHub Pages.

- `index.html`, `style.css`, `app.js`: vanilla JS, inline SVG chart, no external dependencies.
- `data/castle_towns.json`: 223 rows from `../castle_towns_v2.csv` with every citation column (URL columns as lists), plus `sources`, `stats` and `meta`.
  Rebuild with `../.venv/bin/python build_data.py` from `/workspace/castle-towns`.
- `data/castle_towns_v2.csv`, `sources_v2.csv`, `stats_v2.json`: downloadable copies.
- URL state: `?station=central`, `?x=density|area`, `?color=matsue&cmp=pop|density|band`, `?former=0`, `?jinya=0`, `?town=<municipal_code>`.

`build_data.py` normalises 169 malformed list URLs of the form `https://www.wikidata.org/wiki/http://www.wikidata.org/entity/Q…` to `https://www.wikidata.org/wiki/Q…` (logged in `meta.url_fixes`). No values are changed.
