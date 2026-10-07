(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var REGIONS = ['North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East & Africa'];
  var REGION_WEIGHTS = [0.34, 0.27, 0.19, 0.12, 0.08];
  var CUSTOMERS = ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Stark Ltd', 'Wayne Co', 'Hooli', 'Vandelay'];
  var STATUSES = ['paid', 'paid', 'paid', 'paid', 'pending', 'pending', 'refunded'];

  var state = { range: 30, data: null };

  // ---------- formatting ----------

  var compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  var whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var moneyCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
  var dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

  function pct(v) { return (v * 100).toFixed(2) + '%'; }

  // ---------- sample data ----------

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Generates 2 × range days so the previous period is available for deltas.
  function generateData(range) {
    var rnd = mulberry32(1000 + range);
    var total = range * 2;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = [];

    for (var i = 0; i < total; i++) {
      var date = new Date(today);
      date.setDate(today.getDate() - (total - 1 - i));
      var weekend = date.getDay() === 0 || date.getDay() === 6;
      var web = 9000 + i * 12 + (weekend ? -1800 : 0) + (rnd() - 0.5) * 900;
      var mobile = 5200 + i * 22 + (weekend ? 900 : 0) + (rnd() - 0.5) * 700;
      var visitors = web + mobile;
      var conversion = 0.026 + i * 0.00002 + (rnd() - 0.5) * 0.004;
      var orders = Math.round(visitors * conversion);
      var aov = 54 + (rnd() - 0.5) * 8;
      days.push({
        date: date,
        web: Math.round(web),
        mobile: Math.round(mobile),
        visitors: visitors,
        orders: orders,
        revenue: orders * aov
      });
    }

    var current = days.slice(range);
    var previous = days.slice(0, range);
    var revenue = sum(current, 'revenue');

    var regionRaw = REGION_WEIGHTS.map(function (w) { return w * (0.85 + rnd() * 0.3); });
    var regionTotal = regionRaw.reduce(function (a, b) { return a + b; }, 0);
    var regions = REGIONS.map(function (name, i) {
      return { name: name, value: revenue * regionRaw[i] / regionTotal };
    }).sort(function (a, b) { return b.value - a.value; });

    var orders = [];
    for (var o = 0; o < 8; o++) {
      var placed = new Date(Date.now() - (o * 47 + rnd() * 40) * 60000);
      orders.push({
        id: 'XYZ-' + (48210 - o * 7 - Math.floor(rnd() * 5)),
        customer: CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)],
        region: REGIONS[Math.floor(rnd() * REGIONS.length)],
        placed: placed,
        amount: 20 + rnd() * 380,
        status: STATUSES[Math.floor(rnd() * STATUSES.length)]
      });
    }

    return { current: current, previous: previous, regions: regions, orders: orders };
  }

  function sum(rows, key) {
    return rows.reduce(function (acc, r) { return acc + r[key]; }, 0);
  }

  function avg(rows, key) { return sum(rows, key) / rows.length; }

  // ---------- svg helpers ----------

  function el(tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function text(str, attrs, parent) {
    var node = el('text', attrs, parent);
    node.textContent = str;
    return node;
  }

  function niceStep(raw) {
    var pow = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }

  function niceScale(max, count) {
    var step = niceStep(max / count);
    return { max: Math.ceil(max / step) * step, step: step };
  }

  function tooltipFor(host) {
    var tip = host.querySelector('.tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.setAttribute('role', 'status');
      host.appendChild(tip);
    }
    return tip;
  }

  function placeTooltip(host, tip, x, y) {
    var w = tip.offsetWidth;
    var left = x + 12;
    if (left + w > host.clientWidth) left = x - w - 12;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = Math.max(0, y - tip.offsetHeight / 2) + 'px';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------- KPI tiles ----------

  function bucket(values, n) {
    var size = values.length / n;
    var out = [];
    for (var i = 0; i < n; i++) {
      var slice = values.slice(Math.floor(i * size), Math.floor((i + 1) * size));
      out.push(slice.reduce(function (a, b) { return a + b; }, 0) / slice.length);
    }
    return out;
  }

  function sparkline(values) {
    var w = 96, h = 28, pad = 4;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var span = max - min || 1;
    var pts = values.map(function (v, i) {
      return [pad + i * (w - pad * 2) / (values.length - 1), h - pad - (v - min) / span * (h - pad * 2)];
    });
    var svg = el('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, class: 'spark', 'aria-hidden': 'true' });
    el('polyline', {
      points: pts.map(function (p) { return p.join(','); }).join(' '),
      fill: 'none', stroke: 'var(--text-muted)', 'stroke-width': 1.5,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }, svg);
    var last = pts[pts.length - 1];
    el('circle', { cx: last[0], cy: last[1], r: 3, fill: 'var(--series-1)', stroke: 'var(--surface)', 'stroke-width': 1.5 }, svg);
    return svg;
  }

  function renderKpis(data, range) {
    var cur = data.current, prev = data.previous;
    var curOrders = sum(cur, 'orders'), prevOrders = sum(prev, 'orders');
    var tiles = [
      {
        label: 'Revenue', hero: true,
        value: moneyCompact.format(sum(cur, 'revenue')),
        now: sum(cur, 'revenue'), before: sum(prev, 'revenue'),
        trend: cur.map(function (d) { return d.revenue; })
      },
      {
        label: 'Avg daily active users',
        value: compact.format(avg(cur, 'visitors')),
        now: avg(cur, 'visitors'), before: avg(prev, 'visitors'),
        trend: cur.map(function (d) { return d.visitors; })
      },
      {
        label: 'Conversion rate',
        value: pct(curOrders / sum(cur, 'visitors')),
        now: curOrders / sum(cur, 'visitors'), before: prevOrders / sum(prev, 'visitors'),
        trend: cur.map(function (d) { return d.orders / d.visitors; })
      },
      {
        label: 'Avg order value',
        value: money.format(sum(cur, 'revenue') / curOrders),
        now: sum(cur, 'revenue') / curOrders, before: sum(prev, 'revenue') / prevOrders,
        trend: cur.map(function (d) { return d.revenue / d.orders; })
      }
    ];

    var host = document.getElementById('kpis');
    host.innerHTML = '';
    tiles.forEach(function (t) {
      var change = (t.now - t.before) / t.before;
      var up = change >= 0;
      var tile = document.createElement('div');
      tile.className = 'kpi' + (t.hero ? ' hero' : '');
      tile.innerHTML =
        '<span class="kpi-label">' + t.label + '</span>' +
        '<span class="kpi-value">' + t.value + '</span>' +
        '<div class="kpi-foot"><span class="delta ' + (up ? 'up' : 'down') + '">' +
        (up ? '▲ +' : '▼ ') + (change * 100).toFixed(1) + '% ' +
        '<span class="period">vs previous ' + range + ' days</span></span></div>';
      tile.querySelector('.kpi-foot').appendChild(sparkline(bucket(t.trend, Math.min(12, t.trend.length))));
      host.appendChild(tile);
    });
  }

  // ---------- line chart: daily active users ----------

  var DAU_SERIES = [
    { key: 'web', label: 'Web', color: 'var(--series-1)' },
    { key: 'mobile', label: 'Mobile', color: 'var(--series-2)' }
  ];

  function renderLegend() {
    document.getElementById('dau-legend').innerHTML = DAU_SERIES.map(function (s) {
      return '<li><span class="key" style="background:' + s.color + '"></span>' + s.label + '</li>';
    }).join('');
  }

  function renderDauChart(rows) {
    var host = document.getElementById('dau-chart');
    host.querySelectorAll('svg').forEach(function (n) { n.remove(); });
    var W = host.clientWidth, H = 280;
    var m = { t: 12, r: 92, b: 28, l: 44 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var n = rows.length;

    var max = Math.max.apply(null, rows.map(function (d) { return Math.max(d.web, d.mobile); }));
    var scale = niceScale(max, 4);
    var x = function (i) { return m.l + (n === 1 ? 0 : i * iw / (n - 1)); };
    var y = function (v) { return m.t + ih - v / scale.max * ih; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, preserveAspectRatio: 'xMinYMin meet', role: 'img', 'aria-label': 'Daily active users by platform' });
    host.insertBefore(svg, host.firstChild);

    for (var v = 0; v <= scale.max; v += scale.step) {
      el('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v), class: v === 0 ? 'baseline' : 'gridline' }, svg);
      text(compact.format(v), { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg);
    }

    var tickCount = Math.min(n, W < 500 ? 3 : 6);
    for (var t = 0; t < tickCount; t++) {
      var idx = Math.round(t * (n - 1) / (tickCount - 1));
      var anchor = t === 0 ? 'start' : t === tickCount - 1 ? 'end' : 'middle';
      text(dayFmt.format(rows[idx].date), { x: x(idx), y: H - 8, 'text-anchor': anchor, class: 'tick' }, svg);
    }

    DAU_SERIES.forEach(function (s) {
      var d = rows.map(function (r, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r[s.key]).toFixed(1); }).join(' ');
      el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    });

    // End dots + direct labels; labels are dropped (legend carries identity) if they would collide.
    var last = rows[n - 1];
    var ends = DAU_SERIES.map(function (s) { return { s: s, y: y(last[s.key]), v: last[s.key] }; });
    var collide = Math.abs(ends[0].y - ends[1].y) < 16;
    ends.forEach(function (e) {
      el('circle', { cx: x(n - 1), cy: e.y, r: 4, fill: e.s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      if (!collide) {
        text(e.s.label + ' ' + compact.format(e.v), { x: x(n - 1) + 10, y: e.y + 4, class: 'end-label' }, svg);
      }
    });

    // Hover layer: crosshair + per-series dots + tooltip.
    var hover = el('g', { visibility: 'hidden' }, svg);
    var cross = el('line', { y1: m.t, y2: m.t + ih, class: 'crosshair' }, hover);
    var dots = DAU_SERIES.map(function (s) {
      return el('circle', { r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, hover);
    });
    var tip = tooltipFor(host);
    var overlay = el('rect', { x: m.l, y: m.t, width: Math.max(0, iw), height: ih, fill: 'transparent' }, svg);

    function move(evt) {
      var rect = svg.getBoundingClientRect();
      var k = Math.min(rect.width / W, rect.height / H);
      var px = (evt.clientX - rect.left) / k;
      var i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / iw * (n - 1))));
      var r = rows[i];
      var cx = x(i);
      hover.setAttribute('visibility', 'visible');
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      DAU_SERIES.forEach(function (s, k) {
        dots[k].setAttribute('cx', cx);
        dots[k].setAttribute('cy', y(r[s.key]));
      });
      tip.innerHTML = '<div class="tt-title">' + dayFmt.format(r.date) + '</div>' +
        DAU_SERIES.map(function (s) {
          return '<div class="tt-row"><span class="swatch" style="background:' + s.color + '"></span>' +
            s.label + '<b>' + whole.format(r[s.key]) + '</b></div>';
        }).join('');
      tip.classList.add('show');
      placeTooltip(host, tip, cx * k, y(Math.max(r.web, r.mobile)) * k);
    }

    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerleave', function () {
      hover.setAttribute('visibility', 'hidden');
      tip.classList.remove('show');
    });

    document.getElementById('dau-table').innerHTML =
      '<table><thead><tr><th>Date</th><th class="num">Web</th><th class="num">Mobile</th></tr></thead><tbody>' +
      rows.slice().reverse().map(function (r) {
        return '<tr><td>' + dayFmt.format(r.date) + '</td><td class="num">' + whole.format(r.web) +
          '</td><td class="num">' + whole.format(r.mobile) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ---------- bar chart: revenue by region ----------

  function barPath(x0, y0, w, h, r) {
    r = Math.min(r, w, h / 2);
    return 'M' + x0 + ' ' + y0 + 'h' + (w - r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
      'v' + (h - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + r + 'h' + (r - w) + 'z';
  }

  function renderRegionChart(regions) {
    var host = document.getElementById('region-chart');
    host.querySelectorAll('svg').forEach(function (n) { n.remove(); });
    var W = host.clientWidth;
    var rowH = 44, barH = 20;
    var m ={ t: 4, r: 64, b: 4, l: 0 };
    var H = m.t + m.b + regions.length * rowH;

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, preserveAspectRatio: 'xMinYMin meet', role: 'img', 'aria-label': 'Revenue by region' });
    host.insertBefore(svg, host.firstChild);

    // Region names sit above each bar so long names never squeeze the bars on narrow cards.
    var iw = W - m.l - m.r;
    var max = regions[0].value;
    var tip = tooltipFor(host);
    var total = regions.reduce(function (a, r) { return a + r.value; }, 0);

    regions.forEach(function (r, i) {
      var top = m.t + i * rowH;
      var barY = top + 18;
      var w = Math.max(4, r.value / max * iw);
      text(r.name, { x: m.l, y: top + 12, class: 'bar-label' }, svg);
      var bar = el('path', { d: barPath(m.l, barY, w, barH, 4), fill: 'var(--series-1)' }, svg);
      text(moneyCompact.format(r.value), { x: m.l + w + 8, y: barY + barH / 2 + 4, class: 'bar-value' }, svg);

      var hit = el('rect', { x: 0, y: top, width: W, height: rowH, fill: 'transparent' }, svg);
      hit.addEventListener('pointerenter', function () {
        bar.setAttribute('opacity', '0.85');
        tip.innerHTML = '<div class="tt-title">' + escapeHtml(r.name) + '</div>' +
          '<div class="tt-row">Revenue<b>' + money.format(r.value) + '</b></div>' +
          '<div class="tt-row">Share<b>' + (r.value / total * 100).toFixed(1) + '%</b></div>';
        tip.classList.add('show');
        var rect = svg.getBoundingClientRect();
        var k = Math.min(rect.width / W, rect.height / H);
        placeTooltip(host, tip, (m.l + w) * k, (barY + barH / 2) * k);
      });
      hit.addEventListener('pointerleave', function () {
        bar.removeAttribute('opacity');
        tip.classList.remove('show');
      });
    });

    document.getElementById('region-table').innerHTML =
      '<table><thead><tr><th>Region</th><th class="num">Revenue</th><th class="num">Share</th></tr></thead><tbody>' +
      regions.map(function (r) {
        return '<tr><td>' + escapeHtml(r.name) + '</td><td class="num">' + money.format(r.value) +
          '</td><td class="num">' + (r.value / total * 100).toFixed(1) + '%</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ---------- orders table ----------

  function timeAgo(date) {
    var mins = Math.round((Date.now() - date) / 60000);
    if (mins < 60) return mins + 'm ago';
    return Math.round(mins / 60) + 'h ago';
  }

  function renderOrders(orders) {
    var label = { paid: 'Paid', pending: 'Pending', refunded: 'Refunded' };
    document.getElementById('orders').innerHTML =
      '<table><thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th class="num">Amount</th><th>Status</th></tr></thead><tbody>' +
      orders.map(function (o) {
        return '<tr><td>' + o.id + '</td><td>' + escapeHtml(o.customer) + '</td><td>' + timeAgo(o.placed) +
          '</td><td class="num">' + money.format(o.amount) + '</td><td><span class="status ' + o.status +
          '"><span class="dot" aria-hidden="true"></span>' + label[o.status] + '</span></td></tr>';
      }).join('') + '</tbody></table>';
  }

  // ---------- wiring ----------

  function renderCharts() {
    renderDauChart(state.data.current);
    renderRegionChart(state.data.regions);
  }

  function setRange(range) {
    state.range = range;
    state.data = generateData(range);
    document.querySelectorAll('[data-range]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.range) === range));
    });
    document.getElementById('range-label').textContent = 'last ' + range + ' days';
    renderKpis(state.data, range);
    renderCharts();
    renderOrders(state.data.orders);
  }

  function initTheme() {
    var btn = document.getElementById('theme-toggle');
    try {
      var saved = localStorage.getItem('xyz-theme');
      if (saved) document.documentElement.dataset.theme = saved;
    } catch (e) { /* storage unavailable */ }
    btn.addEventListener('click', function () {
      var current = document.documentElement.dataset.theme ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('xyz-theme', next); } catch (e) { /* ignore */ }
    });
  }

  document.querySelectorAll('[data-range]').forEach(function (b) {
    b.addEventListener('click', function () { setRange(Number(b.dataset.range)); });
  });

  // Re-render when a chart's container width changes (window resize, layout settling).
  var widths = new WeakMap();
  var resizeTimer;
  var observer = new ResizeObserver(function (entries) {
    var changed = entries.some(function (e) {
      var w = Math.round(e.contentRect.width);
      if (widths.get(e.target) === w) return false;
      widths.set(e.target, w);
      return true;
    });
    if (!changed || !state.data) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderCharts, 50);
  });
  observer.observe(document.getElementById('dau-chart'));
  observer.observe(document.getElementById('region-chart'));

  initTheme();
  renderLegend();
  setRange(state.range);
})();
