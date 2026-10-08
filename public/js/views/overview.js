import { h, icon, svg, replace } from '../dom.js';
import { api, query } from '../api.js';
import { emptyState } from '../ui.js';
import { state } from '../state.js';
import { cardTitle, product, productChip, resultBadge, shortFingerprint, timeEl } from '../format.js';
import { openCard } from '../card-drawer.js';
import { openGenerate } from '../generate.js';

export async function overview(root) {
  const [summary, log] = await Promise.all([
    api(`/api/dashboard${query({ tz: new Date().getTimezoneOffset() })}`),
    api('/api/activation-log?limit=8'),
  ]);
  const week = summary.trend.slice(-7);
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
  const stock = summary.products.reduce((total, p) => total + p.unused, 0);
  const kpi = (label, value, sub, href) => h(href ? 'a' : 'div', { class: 'panel kpi', href }, h('span', { class: 'label' }, label), h('strong', null, value), h('span', { class: 'sub' }, sub));

  replace(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, '概览'), h('p', null, `你好，${state.session.username}。这里是各产品的库存和激活情况。`)),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openGenerate() }, icon('plus'), '生成卡密'))),
    h('div', { class: 'kpis' },
      kpi('可售库存', stock, '未激活的可用卡密', '#/cards?state=unused'),
      kpi('全部卡密', summary.totals.total, `${summary.totals.disabled} 张已停用`, '#/cards'),
      kpi('已绑定设备', summary.totals.activations, '累计激活的电脑', null),
      kpi('近 7 天新激活', sum(week, 'activated'), `${sum(week, 'failed')} 次失败请求`, '#/logs')),
    h('div', { class: 'product-cards' }, summary.products.map(productCard)),
    h('div', { class: 'two-col' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h2', null, '近 30 天激活'), h('p', null, '每日新设备激活与失败请求次数（重复激活不计入柱高）'))),
        h('div', { class: 'panel-body' }, trendChart(summary.trend))),
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', null, '最新激活请求'), h('a', { class: 'small', href: '#/logs' }, '全部记录')),
        h('div', { class: 'panel-body' }, log.items.length ? h('div', { class: 'feed' }, log.items.map(feedItem))
          : emptyState('activity', '还没有激活请求', '客户在软件里输入卡密后，请求会显示在这里。')))));
}

function productCard(stats) {
  const p = product(stats.productId);
  const segments = ['unused', 'partial', 'full', 'disabled'];
  const labels = { unused: '未使用', partial: '部分激活', full: '已满', disabled: '已停用' };
  const bar = h('div', { class: 'stack', role: 'img', 'aria-label': segments.map(s => `${labels[s]} ${stats[s]}`).join('，') });
  for (const s of segments) if (stats[s]) { const seg = h('i', { class: s, title: `${labels[s]} ${stats[s]} 张` }); seg.style.flexGrow = String(stats[s]); bar.append(seg); }
  return h('section', { class: 'panel product-card' },
    h('div', { class: 'top' }, productChip(stats.productId), h('span', { class: 'muted small' }, `共 ${stats.total} 张 · ${stats.activations} 台设备`)),
    h('div', { class: 'stock' }, h('strong', null, stats.unused), h('span', { class: 'muted' }, '张可售库存')),
    stats.total ? bar : h('div', { class: 'stack' }),
    h('div', { class: 'legend' }, segments.map(s => h('a', { href: `#/cards?productId=${stats.productId}&state=${s}` }, h('span', { class: s }, labels[s], ' ', h('b', null, stats[s]))))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openGenerate({ productId: stats.productId }) }, icon('plus'), `生成${p.name}卡密`),
      h('a', { class: 'btn btn-sm btn-ghost', href: `#/cards?productId=${stats.productId}` }, '查看全部')));
}

function feedItem(item) {
  const title = item.cardExists ? (item.customer || item.note || `卡密 ${item.cardId.slice(0, 8)}`) : (item.cardId ? '已删除的卡密' : '未匹配到卡密');
  return h('div', { class: 'feed-item', role: item.cardExists ? 'button' : undefined, tabindex: item.cardExists ? '0' : undefined,
    onclick: () => item.cardExists && openCard(item.cardId), onkeydown: e => { if (e.key === 'Enter' && item.cardExists) openCard(item.cardId); } },
    resultBadge(item.result),
    h('div', { class: 'truncate' }, h('div', { class: 'truncate' }, title), h('div', { class: 'meta truncate' }, item.productId ? product(item.productId).name : '—', ' · ', shortFingerprint(item.machineFingerprint))),
    h('span', { class: 'meta' }, timeEl(item.at)));
}

// Daily stacked columns: new activations (blue) under failed requests (orange). One axis; hover tooltip per day.
function trendChart(trend) {
  const width = 640; const height = 190; const left = 28; const bottom = 22; const top = 8;
  const max = Math.max(1, ...trend.map(d => d.activated + d.failed));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const plotH = height - bottom - top;
  const band = (width - left) / trend.length;
  const barW = Math.min(14, band - 4);
  const y = v => top + plotH - v / yMax * plotH;
  const root = h('div', { class: 'chart' });
  const tip = h('div', { class: 'tooltip', hidden: true });
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `近 30 天共 ${trend.reduce((s, d) => s + d.activated, 0)} 次新激活` });
  for (let v = 0; v <= yMax; v += step) {
    chart.append(svg('line', { class: 'grid-line', x1: left, x2: width, y1: y(v), y2: y(v) }),
      svg('text', { class: 'axis-label', x: left - 6, y: y(v) + 3.5, 'text-anchor': 'end' }, document.createTextNode(String(v))));
  }
  const rounded = (x, yTop, w, hgt) => {
    const r = Math.min(4, w / 2, hgt);
    return `M${x},${yTop + hgt}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + hgt}Z`;
  };
  trend.forEach((d, i) => {
    const x = left + i * band + (band - barW) / 2;
    const g = svg('g', { class: 'bar' });
    const okH = d.activated / yMax * plotH; const failH = d.failed / yMax * plotH;
    const base = top + plotH;
    // Only the topmost segment gets the rounded data-end; a 2px surface gap separates the stack.
    if (okH > 0) g.append(svg(d.failed ? 'rect' : 'path', d.failed ? { class: 'bar-ok', x, y: base - okH, width: barW, height: okH } : { class: 'bar-ok', d: rounded(x, base - okH, barW, okH) }));
    if (failH > 0) { const gap = okH > 0 ? 2 : 0; g.append(svg('path', { class: 'bar-fail', d: rounded(x, base - okH - gap - failH, barW, failH) })); }
    const hit = svg('rect', { class: 'hit', x: left + i * band, y: top, width: band, height: plotH });
    hit.addEventListener('mouseenter', () => {
      chart.querySelectorAll('g.bar').forEach(el => el.classList.toggle('dim', el !== g));
      replace(tip, h('strong', null, d.date.slice(5).replace('-', ' 月 ') + ' 日'),
        h('div', { class: 'row' }, h('span', { class: 'ok' }, '新激活'), h('b', null, d.activated)),
        h('div', { class: 'row' }, h('span', { class: 'fail' }, '失败'), h('b', null, d.failed)),
        h('div', { class: 'row' }, h('span', { class: 'renew' }, '重复激活'), h('b', null, d.renewed)));
      tip.hidden = false;
      tip.style.left = `${(left + (i + 0.5) * band) / width * 100}%`;
      tip.style.top = `${y(d.activated + d.failed) / height * 100}%`;
    });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; chart.querySelectorAll('g.bar').forEach(el => el.classList.remove('dim')); });
    chart.append(g, hit);
    if (i % 5 === 4 || i === trend.length - 1) chart.append(svg('text', { class: 'axis-label', x: left + (i + 0.5) * band, y: height - 6, 'text-anchor': 'middle' }, document.createTextNode(d.date.slice(5))));
  });
  root.append(chart, tip);
  return h('div', null, h('div', { class: 'legend' }, h('span', { class: 'ok' }, '新激活'), h('span', { class: 'fail' }, '失败请求')), root);
}
function niceStep(max) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return Math.max(1, [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw));
}
