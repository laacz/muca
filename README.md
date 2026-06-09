# MUCA — Latvian Breweries Map

An interactive map of beer breweries, cideries and wineries in Latvia. The UI
implements the **MUCA** design from Claude Design, ported to **vanilla
HTML / CSS / JS** (no framework, no build step). The map is a real
[Leaflet](https://leafletjs.com/) map with clean [CARTO](https://carto.com/)
basemaps that swap with light/dark mode. The app is fully static — there is no
server-side code.

## Run it

Any static file server works. From the project folder:

```bash
php -S 127.0.0.1:8000   # or: python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

In production, point any static web root at this folder.

## Files

| File                | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `index.php`         | The UI — declarative [Alpine.js](https://alpinejs.dev/) markup       |
| `style.css`         | Design system — palette, light/dark, category colors, layout         |
| `app.js`            | Registers the `muca` Alpine component; drives the Leaflet map         |
| `breweries.json`    | **The data** — edit this to add/change makers                        |
| `vendor/alpine/`    | Vendored Alpine.js (pinned), loaded with `defer`                     |
| `vendor/leaflet/`   | Vendored Leaflet                                                     |

The header, sidebar list, slide-over detail panel and About modal are all
declarative Alpine in `index.php`. The map stays imperative: `app.js` keeps the
Leaflet instance in closure scope (never on Alpine's reactive proxy) and mirrors
filter/search/selection changes into it via `$watch`.

## The design

- **Layout:** `MUCA.` wordmark header with a Beer / Cider / Wine segmented
  filter (live counts), a sidebar maker list, and a large real map. Clicking a
  card or a map pin slides a detail panel over the list.
- **Palette:** Latvian flag carmine `#9E3039` accent on a porcelain `#ededec`
  canvas, with a light/dark toggle. Category coding lives on the pins only —
  amber beer, green cider, carmine wine.
- **Type:** Space Grotesk (display) + Hanken Grotesk (body) + Space Mono (small
  technical metadata).
- **Detail panel:** status + founded badges, description, and a Details block
  with copyable **Address** and **Coordinates** (precision noted inline) plus a
  website link.
- **Pins:** colored by category, defunct ones dashed/greyed (hidden by default
  via the header toggle); the selected pin enlarges and pulses.

## Data format

`breweries.json` is an array of objects:

```json
{
  "id": "labietis",
  "name": "Labietis",
  "type": "beer",                 // "beer" | "cider" | "wine"
  "status": "working",            // "working" | "defunct"
  "address": "Aristida Briāna iela 9A, Rīga, LV-1001",
  "city": "Rīga",
  "region": "Rīga",               // Vidzeme | Kurzeme | Zemgale | Latgale | Rīga
  "lat": 56.9648,
  "lng": 24.131,
  "coord_precision": "exact",     // "exact" (venue) | "approx" (town-level)
  "founded": 2013,
  "logo": "",
  "website": "https://labietis.lv",
  "description": "An experimental Riga craft brewery…"
}
```

49 makers are included (27 beer, 12 cider, 10 wine). Coordinates are real;
about half are resolved to the exact venue (`exact`), the rest are town-level
(`approx`, shown as "· approximate" beside the coordinates).

## About

The header **About** button opens a modal noting that MUCA is part of the
**didnt.work** family of small apps, with a `mailto:` link to
`apps@didnt.work` (subject pre-filled with `[MUCA]`) for suggestions and
corrections. There is no server-side endpoint.
