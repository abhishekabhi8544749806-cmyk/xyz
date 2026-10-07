# xyz reviewer notes

## Architecture

This is a browser-side analytics dashboard implemented as a self-contained vanilla JavaScript module in `dashboard.js`. It generates deterministic sample data, computes KPI comparisons between current and previous periods, and renders dashboard UI—including charts, legends, tooltips, and sparklines—directly into DOM elements and inline SVG. State is held in the module-local `state` object and keyed by dashboard element IDs such as `kpis`, `dau-chart`, and `dau-legend`.

## Conventions

- Keep implementation encapsulated in the top-level IIFE and use strict mode: `dashboard.js` begins with `(function () { 'use strict'; ... })();`.
- Existing code targets older JavaScript syntax: use `var`, function declarations, traditional callbacks, and `forEach`/`map` rather than introducing module syntax, classes, or newer language features without evidence elsewhere.
- Keep dashboard constants centralized near the top of `dashboard.js`, such as `REGIONS`, `REGION_WEIGHTS`, `CUSTOMERS`, `STATUSES`, and `DAU_SERIES`.
- Use the shared formatting objects for display values: `compact`, `whole`, `money`, `moneyCompact`, and `dayFmt`; do not duplicate locale or currency formatting in individual renderers.
- Data generation and aggregation are separated from rendering. `generateData()` creates records, while helpers such as `sum()`, `avg()`, `renderKpis()`, and `renderDauChart()` consume them.
- Build SVG through the `el()` and `text()` helpers, which create namespaced elements and set attributes consistently. Charts should expose semantics using attributes such as `role="img"` and `aria-label`.
- Render functions clear or replace their target content before drawing. For example, `renderKpis()` sets `host.innerHTML = ''`, while `renderDauChart()` removes existing SVG nodes.
- Use CSS custom properties for chart colors and surfaces (`var(--series-1)`, `var(--series-2)`, `var(--surface)`) rather than hard-coded theme colors.
- Escape interpolated content when constructing HTML. `escapeHtml()` exists for this purpose; direct `innerHTML` should be limited to controlled/static values.

## Intentional non-standard choices

- The dashboard uses generated demo data rather than an API. `generateData(range)` seeds `mulberry32` with `1000 + range`, so changing the selected range produces repeatable data for that range.
- Dates are intentionally relative to the current day (`new Date()`), while recent order timestamps use `Date.now()`, so the sample dashboard always appears current.
- SVG charts use direct labels where possible, but `renderDauChart()` deliberately suppresses end labels when the two series would collide; the legend remains the identity fallback.

## Watch out for

- Preserve the two-period data contract: `generateData()` creates `range * 2` days and splits them into `current` and `previous`; changing this can silently break KPI deltas.
- Guard calculations that divide by orders, visitors, or array lengths if data generation or filtering is changed. Current code computes conversion and average order value directly in `renderKpis()`.
- When changing chart sizing or interaction code, account for responsive scaling: `renderDauChart()` maps pointer coordinates using the SVG bounding rectangle and viewBox scale.
- Avoid adding unsanitized user-controlled values to the HTML strings used by KPI and legend rendering; use text nodes or `escapeHtml()` for dynamic content.