# MUCA — Latvian Breweries Map

An interactive map of beer breweries, cideries and wineries in Latvia. Can be found at [muca.didnt.work](https://muca.didnt.work).

## Building

The site is fully static — everything in `public/` is served as-is, no bundler or dependencies. All map data lives in `public/breweries.json`; logos go to `public/logos/`.

The only generated artifacts are the schema.org JSON-LD block in `public/index.html` and `public/sitemap.xml`. After editing `breweries.json`, regenerate them before committing:

```sh
python3 scripts/gen-seo.py
```

To preview locally, serve `public/` with any static file server, e.g.:

```sh
python3 -m http.server -d public 8000
```


