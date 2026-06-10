(function () {
  "use strict";

  // Config
  const FILTERS = [
    { key: "all", label: "All" }, { key: "beer", label: "Beer" },
    { key: "cider", label: "Cider" }, { key: "wine", label: "Wine" },
  ];
  const TYPE_LABEL = { beer: "Beer", cider: "Cider", wine: "Wine" };
  const TILES = {
    light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    dark:  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  };
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

  // Icons (24×24 stroke) - only the ones JS builds dynamically; static icons
  //    are inlined in index.php.
  const ICONS = {
    barrel: '<path d="M7 3h10c2.2 2.7 2.2 15.3 0 18H7c-2.2-2.7-2.2-15.3 0-18Z"/><path d="M12 3v18"/><path d="M5.6 7.5c4.2 1.5 8.6 1.5 12.8 0M5.6 15.5c4.2 1.5 8.6 1.5 12.8 0"/>',
    beer: '<path d="M6 8h9v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8Z"/><path d="M15 10h2.5a2.5 2.5 0 0 1 0 5H15"/><path d="M7.5 8c-.4-2 .6-3.4 2.2-3.4.6-1.3 2.3-1.6 3.2-.6 1.6-.4 2.7.7 2.4 2.3"/>',
    cider: '<path d="M12 7c-3 0-5 2.2-5 6 0 4 2.4 7 5 7s5-3 5-7c0-3.8-2-6-5-6Z"/><path d="M12 7c0-1.6.8-3 2.5-3.6"/>',
    wine: '<path d="M7 3h10l-.6 5.5a4.4 4.4 0 0 1-8.8 0L7 3Z"/><path d="M12 14v5"/><path d="M8.5 19h7"/>',
    all: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5Z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15H4.5A2.5 2.5 0 0 1 4 10.5V5a2 2 0 0 1 2-2h5.5A2.5 2.5 0 0 1 15 5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 6.5"/>',
  };
  const svgIcon = (inner) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner || ""}</svg>`;

  // Dark-mode persistence (the only user preference)
  const PREF_KEY = "muca_prefs";
  function loadDark() {
    try { return !!JSON.parse(localStorage.getItem(PREF_KEY) || "{}").dark; }
    catch (e) { return false; }
  }
  function saveDark(dark) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ dark: dark })); }
    catch (e) { /* no-op */ }
  }

  // Component
  document.addEventListener("alpine:init", () => {
    Alpine.data("muca", () => {
      // Leaflet lives here, OUTSIDE the reactive proxy. The methods below close
      // over these; assigning them never touches Alpine reactivity.
      let map = null, tileLayer = null;
      const markers = {};

      return {
        // constants exposed to the template
        filters: FILTERS,
        TYPE_LABEL: TYPE_LABEL,

        kbdK: /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "⌘K" : "Ctrl K",

        // reactive UI state
        dark: loadDark(),
        filter: "all",
        hideDefunct: true,
        query: "",
        selectedId: null,
        aboutOpen: false,
        copied: null,
        copyTimer: null,

        // data
        data: [],
        error: null,
        mapError: null,

        // computed
        get items() {
          const q = this.query.trim().toLowerCase();
          return this.data
            .filter((b) => this.filter === "all" || b.types.includes(this.filter))
            .filter((b) => !(this.hideDefunct && this.isDefunct(b)))
            .filter((b) => !q || [b.name, b.city, b.region, b.description, b.note || ""].join(" ").toLowerCase().includes(q))
            .sort((a, b) => (this.isDefunct(a) - this.isDefunct(b)) || a.name.localeCompare(b.name));
        },
        get selected() {
          return this.data.find((x) => x.id === this.selectedId) || null;
        },

        // view helpers
        icon(n) { return svgIcon(ICONS[n] || ""); },
        catIcon(t) { return this.icon(ICONS[t] ? t : "all"); },
        isDefunct(b) { return b.status === "defunct"; },
        precisionOf(b) { return b.coord_precision === "exact" ? "exact" : "approximate"; },
        tagline(b) {
          const s = (b.description || "").split(/(?<=[.!?])\s/)[0] || "";
          return s.length > 76 ? s.slice(0, 73).trimEnd() + "…" : s;
        },
        hostOf(url) { return url ? url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : ""; },
        townLine(b) { return b.city === b.region ? b.city : `${b.city} · ${b.region}`; },
        coordsOf(b) { return `${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}`; },
        countFor(key) {
          // a maker counts once per type it makes, so category counts can sum to
          // more than the "all" total (which stays a unique maker count)
          return key === "all" ? this.data.length : this.data.filter((b) => b.types.includes(key)).length;
        },
        // CSS fill for a maker's pin: solid for one type, an even conic split for several
        pie(types) {
          if (types.length < 2) return `var(--c-${types[0]})`;
          const step = 100 / types.length;
          return `conic-gradient(${types.map((t, i) => `var(--c-${t}) ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
        },
        // exact original DOM for a copy button: <svg>…</svg><span>…</span>
        copyInner(key) {
          const done = this.copied === key;
          return this.icon(done ? "check" : "copy") + `<span>${done ? "Copied" : "Copy"}</span>`;
        },

        // lifecycle (Alpine calls init() automatically)
        init() {
          // mirror reactive state into the imperative map
          this.$watch("dark", () => { saveDark(this.dark); this.setTile(); });
          ["filter", "hideDefunct", "query", "selectedId"].forEach((k) =>
            this.$watch(k, () => { if (map) this.updatePins(); }));

          this.load();
        },

        async load() {
          try {
            const r = await fetch("breweries.json", { cache: "no-cache" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            const d = await r.json();
            if (!Array.isArray(d)) throw new Error("Unexpected data shape");
            this.data = d;
            // map is best-effort and must never blank the list - bring it up after
            // the list has rendered.
            this.$nextTick(() => this.initMapSafe());
          } catch (err) {
            this.error = err && err.message ? err.message : String(err);
          }
        },

        // selection
        select(id, fly) {
          this.selectedId = id;
          const b = this.data.find((x) => x.id === id);
          if (b && map && fly) {
            map.flyTo([b.lat, b.lng], Math.max(map.getZoom(), 10), { duration: 0.6 });
          }
          // keep the selected card in view (desktop list)
          this.$nextTick(() => {
            const card = this.$root.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
            if (card) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
          });
        },
        deselect() { this.selectedId = null; },

        copy(key, text) {
          navigator.clipboard.writeText(text).then(() => {
            this.copied = key;
            clearTimeout(this.copyTimer);
            this.copyTimer = setTimeout(() => { this.copied = null; }, 1400);
          });
        },

        onEscape() {
          if (this.aboutOpen) this.aboutOpen = false;
          else if (this.selectedId) this.deselect();
        },

        // "/" (outside a field) or Cmd/Ctrl+K (anywhere) focuses the search box
        onHotkey(e) {
          const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
          const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
          if (!cmdK && !slash) return;
          const t = e.target;
          const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
          if (slash && typing) return;
          e.preventDefault();
          this.$refs.search.focus();
          this.$refs.search.select();
        },

        // Map (imperative Leaflet, best-effort)
        initMapSafe() {
          if (typeof L === "undefined" || !L || typeof L.map !== "function") {
            console.error("MUCA: Leaflet did not load - check that vendor/leaflet/leaflet.js is reachable.");
            this.mapError = "vendor/leaflet/leaflet.js could not be loaded.";
            return;
          }
          try {
            this.initMap();
            this.updatePins();
          } catch (e) {
            console.error("MUCA: map initialisation failed", e);
            this.mapError = e && e.message ? e.message : "The map couldn’t be initialised.";
          }
        },

        initMap() {
          // An initial view is required up front: without it Leaflet defers layer
          // onAdd via whenReady(), and getContainer() returns undefined.
          map = L.map(this.$refs.map, {
            center: [56.85, 24.8], zoom: 7, zoomSnap: 0, // fractional zoom: let fitBounds fill the frame instead of flooring to an integer level
            zoomControl: true, minZoom: 6, maxZoom: 16, worldCopyJump: false,
          });
          this.setTile();

          const legend = L.control({ position: "bottomleft" });
          legend.onAdd = function () {
            const d = L.DomUtil.create("div", "map-legend");
            d.innerHTML = `<div class="lg-title">Makers</div>
              <div class="lg-row"><span class="lg-dot" style="background:var(--c-beer)"></span>Beer</div>
              <div class="lg-row"><span class="lg-dot" style="background:var(--c-cider)"></span>Cider</div>
              <div class="lg-row"><span class="lg-dot" style="background:var(--c-wine)"></span>Wine</div>`;
            L.DomEvent.disableClickPropagation(d);
            return d;
          };
          legend.addTo(map);

          this.data.forEach((b) => {
            const m = L.marker([b.lat, b.lng], {
              riseOnHover: true, keyboard: false,
              icon: L.divIcon({
                className: "pin" + (this.isDefunct(b) ? " is-defunct" : ""),
                html: `<span class="pin-dot" style="--cat:var(--c-${b.types[0]}); --pie:${this.pie(b.types)}"></span>`,
                iconSize: [28, 28], iconAnchor: [14, 14],
              }),
            });
            m.bindTooltip(b.name, { direction: "top", offset: [0, -12], className: "muca-tip", opacity: 1 });
            m.on("click", () => this.select(b.id, false));
            markers[b.id] = m;
          });

          const bounds = L.latLngBounds(this.data.map((b) => [b.lat, b.lng]));
          const fit = () => {
            map.invalidateSize();
            map.setMinZoom(6);                            // relax so the fit isn't clamped
            map.fitBounds(bounds, { padding: [44, 44] }); // default view = all makers
            map.setMinZoom(map.getZoom());                // lock it: never zoom out past the fit
          };
          fit();
          requestAnimationFrame(fit);                       // after first paint
          window.addEventListener("load", fit, { once: true });
          new ResizeObserver(() => map.invalidateSize()).observe(this.$refs.map);
          window.addEventListener("resize", () => map.invalidateSize());
        },

        setTile() {
          if (!map) return;
          if (tileLayer) map.removeLayer(tileLayer);
          tileLayer = L.tileLayer(this.dark ? TILES.dark : TILES.light, {
            attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 20,
          }).addTo(map);
        },

        updatePins() {
          if (!map) return;
          const visible = new Set(this.items.map((b) => b.id));
          Object.keys(markers).forEach((id) => {
            const m = markers[id];
            const on = visible.has(id);
            if (on && !map.hasLayer(m)) m.addTo(map);
            else if (!on && map.hasLayer(m)) map.removeLayer(m);
            if (on && m._icon) {
              const active = id === this.selectedId;
              m._icon.classList.toggle("is-active", active);
              m.setZIndexOffset(active ? 1000 : 0);
            }
          });
        },
      };
    });
  });
})();
