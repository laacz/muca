#!/usr/bin/env python3
"""Regenerate SEO artifacts from public/breweries.json.

Injects schema.org JSON-LD (WebSite + ItemList of Brewery/Winery entries)
between the <!-- seo:jsonld:start/end --> markers in public/index.html and
rewrites public/sitemap.xml. Run after editing breweries.json:

    python3 scripts/gen-seo.py
"""

import datetime
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
BASE_URL = "https://muca.didnt.work/"

# schema.org has no Cidery type; FoodEstablishment is the closest parent.
SCHEMA_TYPE = {"beer": "Brewery", "wine": "Winery", "cider": "FoodEstablishment"}


def schema_types(types):
    seen = []
    for t in types:
        s = SCHEMA_TYPE.get(t, "LocalBusiness")
        if s not in seen:
            seen.append(s)
    return seen[0] if len(seen) == 1 else seen


def item(b, position):
    node = {
        "@type": schema_types(b["types"]),
        "name": b["name"],
        "address": {
            "@type": "PostalAddress",
            "streetAddress": b["address"],
            "addressLocality": b["city"],
            "addressRegion": b["region"],
            "addressCountry": "LV",
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": b["lat"],
            "longitude": b["lng"],
        },
    }
    if b.get("website"):
        node["url"] = b["website"]
    if b.get("founded"):
        node["foundingDate"] = str(b["founded"])
    if b.get("logo"):
        node["logo"] = BASE_URL.rstrip("/") + b["logo"]
    return {"@type": "ListItem", "position": position, "item": node}


def build_jsonld(breweries):
    working = [b for b in breweries if b["status"] == "working"]
    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                "@id": BASE_URL + "#website",
                "url": BASE_URL,
                "name": "MUCA - Latvian Breweries Map",
                "description": (
                    "An interactive map of Latvian beer breweries, cideries "
                    "and wineries - addresses, status and details for makers "
                    "across Latvia."
                ),
                "inLanguage": "en",
            },
            {
                "@type": "ItemList",
                "name": "Latvian breweries, cideries and wineries",
                "numberOfItems": len(working),
                "itemListElement": [item(b, i + 1) for i, b in enumerate(working)],
            },
        ],
    }


def main():
    breweries = json.loads((PUBLIC / "breweries.json").read_text())

    jsonld = json.dumps(build_jsonld(breweries), ensure_ascii=False, separators=(",", ":"))
    index = PUBLIC / "index.html"
    html = index.read_text()
    block = (
        "<!-- seo:jsonld:start -->\n"
        f'  <script type="application/ld+json">{jsonld}</script>\n'
        "  <!-- seo:jsonld:end -->"
    )
    html, n = re.subn(
        r"<!-- seo:jsonld:start -->.*?<!-- seo:jsonld:end -->",
        lambda _: block,
        html,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit("seo:jsonld markers not found in index.html")
    index.write_text(html)

    lastmod = datetime.date.fromtimestamp((PUBLIC / "breweries.json").stat().st_mtime)
    (PUBLIC / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{BASE_URL}</loc><lastmod>{lastmod}</lastmod></url>\n"
        "</urlset>\n"
    )

    print(f"index.html: JSON-LD with {len(breweries)} entries; sitemap lastmod {lastmod}")


if __name__ == "__main__":
    main()
