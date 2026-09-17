/* ============================================================
   我们的纪念册 · 交互逻辑
   纯原生 JS，无依赖。用 IIFE 包裹避免污染全局。
   ------------------------------------------------------------
   结构：
     1. 工具函数
     2. 渲染（把 data.js 的内容填进页面）
     3. 翻页与导航（scroll-snap 由 CSS 负责，这里管状态）
     4. 入场动画与数字滚动
     5. 背景音乐
     6. 飘落爱心彩蛋
   ============================================================ */

(function () {
  'use strict';

  /* ==================== 1. 工具函数 ==================== */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setText(sel, val) {
    var n = $(sel);
    if (n && val != null) n.textContent = val;
  }
  /** 数字格式化：decimals>0 保留小数，否则取整并加千分位 */
  function fmt(v, dec) {
    if (dec > 0) return v.toFixed(dec);
    return Math.round(v).toLocaleString('en-US');
  }

  /* ==================== 1.5 内容分层合并 ====================
     默认层：js/data.js          → window.SITE_DATA       （示例/兜底内容）
     本地层：js/data.local.js    → window.SITE_DATA_LOCAL （你自己填的内容，可选）

     合并规则：
       1) 本地层里「填了内容」的字段才覆盖默认层；
          空字符串 "" / 空数组 [] / 干脆不写这个键 → 算「没填」，沿用默认层；
       2) 想强制留空、连示例也不要 → 把该字段写成 null；
       3) 数组是整体替换：本地层一旦写了这个数组，就完全用你那份，不和示例混排；
       4) 数组里的「空条目」会被丢掉（见 dropEmptySlots）：
          待补充的位置可以留着 "" 占位，填上内容它才会出现，
          所以能一条一条慢慢补，页面不会被空行撑开。
          判空只看文本字段，x / y / weight / decimals / span / milestone 这类
          坐标与开关属性不算「有内容」。 */

  function isFilled(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  /** 单项是否「空占位」：null、空串、空数组，或对象里所有文本字段都为空 */
  function isEmptyValue(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.every(isEmptyValue);
    if (isPlainObject(v)) {
      return Object.keys(v).every(function (k) {
        var x = v[k];
        if (typeof x === 'number' || typeof x === 'boolean') return true;
        return isEmptyValue(x);
      });
    }
    return false;
  }

  /** 递归丢掉数组里的空占位项（含对象内部的数组，如 end.letter） */
  function dropEmptySlots(node) {
    if (Array.isArray(node)) {
      return node.map(dropEmptySlots).filter(function (v) { return !isEmptyValue(v); });
    }
    if (isPlainObject(node)) {
      var out = {};
      Object.keys(node).forEach(function (k) { out[k] = dropEmptySlots(node[k]); });
      return out;
    }
    return node;
  }

  function mergeLayer(base, over) {
    if (!isPlainObject(over)) return base;
    var out = {};
    Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });

    Object.keys(over).forEach(function (k) {
      var v = over[k];

      // null = 显式清空：不回退到示例内容，按默认层的类型给一个空值
      if (v === null) {
        var b = base && base[k];
        out[k] = Array.isArray(b) ? [] : (typeof b === 'string' ? '' : null);
        return;
      }

      if (isPlainObject(v)) {
        out[k] = mergeLayer(isPlainObject(base && base[k]) ? base[k] : {}, v);
      } else if (isFilled(v)) {
        out[k] = v;
      }
    });
    return out;
  }

  var D = dropEmptySlots(mergeLayer(window.SITE_DATA || {}, window.SITE_DATA_LOCAL));

  /* ==================== 2. 渲染 ==================== */

  function renderCover() {
    var c = D.cover;
    if (!c) return;
    setText('#coverEyebrow', c.eyebrow);
    setText('#coverNames', c.names);
    setText('#coverDate', c.date);
    var t = $('#coverTitle');
    if (t && c.title) t.innerHTML = c.title;   // title 支持简单 HTML（如 <br>）
  }

  function renderTimeline() {
    var ol = $('#timeline');
    if (!ol || !D.timeline) return;
    D.timeline.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'reveal' + (it.milestone ? ' milestone' : '');
      li.innerHTML =
        '<p class="t-date">' + esc(it.date) + '</p>' +
        '<p class="t-title">' + esc(it.title) + '</p>' +
        (it.desc ? '<p class="t-desc">' + esc(it.desc) + '</p>' : '');
      ol.appendChild(li);
    });
  }

  function renderPlaces() {
    var ul = $('#mapPoints');
    if (!ul || !D.places) return;
    D.places.forEach(function (p) {
      var li = document.createElement('li');
      li.style.left = (p.x || 50) + '%';
      li.style.top = (p.y || 50) + '%';
      li.innerHTML = '<span class="pin"></span>' +
        '<span class="place-name">' + esc(p.name) + '</span>';
      ul.appendChild(li);
    });
    setText('#mapFoot', D.mapFoot);
  }

  function renderStats() {
    var box = $('#stats');
    if (!box || !D.stats) return;
    D.stats.forEach(function (s) {
      var d = document.createElement('div');
      d.className = 'stat reveal';
      d.innerHTML =
        '<p class="stat-num">' +
          '<span class="v" data-value="' + Number(s.value || 0) + '"' +
          ' data-dec="' + Number(s.decimals || 0) + '">0</span>' +
          (s.unit ? '<span class="stat-unit">' + esc(s.unit) + '</span>' : '') +
        '</p>' +
        '<p class="stat-label">' + esc(s.label) + '</p>';
      box.appendChild(d);
    });
    setText('#statsFoot', D.statsFoot);
  }

  function renderPhotos() {
    var wall = $('#wall');
    if (!wall || !D.photos) return;
    D.photos.forEach(function (p) {
      var fig = document.createElement('figure');
      if (p.span) fig.className = p.span;

      // 占位块：图片加载成功后被盖住，失败或缺失时可见，提示应放的文件名
      var ph = document.createElement('span');
      ph.className = 'ph';
      ph.innerHTML = esc(p.caption || '照片') +
        '<br><span style="opacity:.62;font-size:9.5px">' +
        esc(String(p.src || '').replace('assets/photos/', '')) + '</span>';
      fig.appendChild(ph);

      var img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = p.caption || '';
      img.src = p.src;
      // pos 可选：调整 object-fit:cover 的裁切焦点，如 "50% 20%"
      if (p.pos) img.style.objectPosition = p.pos;
      img.addEventListener('error', function () { img.remove(); });
      fig.appendChild(img);

      if (p.caption) {
        var cap = document.createElement('figcaption');
        cap.textContent = p.caption;
        fig.appendChild(cap);
      }
      wall.appendChild(fig);
    });
    setText('#wallFoot', D.wallFoot);
  }

  function renderCloud() {
    var cloud = $('#cloud');
    if (!cloud || !D.words || !D.words.length) return;

    var weights = D.words.map(function (w) { return Number(w.weight || 1); });
    var maxW = Math.max.apply(null, weights);
    var minW = Math.min.apply(null, weights);
    var span = (maxW - minW) || 1;

    D.words.forEach(function (w, i) {
      var t = (Number(w.weight || 1) - minW) / span;      // 0~1
      var s = document.createElement('span');
      s.textContent = w.text;
      s.style.fontSize = (15 + t * 30).toFixed(1) + 'px';
      s.style.opacity = (0.58 + t * 0.42).toFixed(2);
      // 用下标推一个稳定的轻微旋转，避免每次刷新都错位
      s.style.setProperty('--rot', (((i % 5) - 2) * 2.4).toFixed(1) + 'deg');
      cloud.appendChild(s);
    });
  }

  /** 由数值数组生成平滑路径（用中点做三次贝塞尔，形成 S 形曲线） */
  function smoothPath(pts) {
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i], p1 = pts[i + 1];
      var mx = (p0[0] + p1[0]) / 2;
      d += ' C' + mx + ' ' + p0[1] + ',' + mx + ' ' + p1[1] + ',' + p1[0] + ' ' + p1[1];
    }
    return d;
  }

  function renderMood() {
    var svg = $('#moodSvg');
    if (!svg || !D.mood) return;

    var vals = D.mood.values || [];
    if (!vals.length) return;

    var W = 320, H = 180, padX = 14, padY = 26;
    var innerW = W - padX * 2, innerH = H - padY * 2;
    var n = vals.length;

    var pts = vals.map(function (v, i) {
      var x = padX + (n > 1 ? innerW * i / (n - 1) : innerW / 2);
      var y = padY + innerH * (1 - Math.max(0, Math.min(100, Number(v))) / 100);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });

    var line = smoothPath(pts);
    var area = line + ' L' + pts[n - 1][0] + ' ' + (H - padY + 14) +
               ' L' + pts[0][0] + ' ' + (H - padY + 14) + ' Z';

    var dots = pts.map(function (p, i) {
      var hot = Number(vals[i]) >= 90 ? ' hot' : '';
      return '<circle class="dot' + hot + '" cx="' + p[0] + '" cy="' + p[1] + '" r="3.4"/>';
    }).join('');

    svg.innerHTML =
      '<defs>' +
        '<linearGradient id="moodStroke" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0%" stop-color="#b98cff"/>' +
          '<stop offset="55%" stop-color="#ff8fb1"/>' +
          '<stop offset="100%" stop-color="#ffd79a"/>' +
        '</linearGradient>' +
        '<linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#ff8fb1" stop-opacity=".34"/>' +
          '<stop offset="100%" stop-color="#ff8fb1" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<path class="area" d="' + area + '"/>' +
      '<path class="line" d="' + line + '"/>' +
      dots;

    // 计算路径长度，写入 CSS 变量供描边动画使用
    var lineEl = svg.querySelector('.line');
    if (lineEl && lineEl.getTotalLength) {
      try {
        var len = lineEl.getTotalLength();
        if (len > 0) lineEl.style.setProperty('--len', len.toFixed(1));
      } catch (e) { /* 某些环境不支持，退化为默认值 */ }
    }

    // 横轴标签
    var axis = $('#moodAxis');
    if (axis && D.mood.labels) {
      D.mood.labels.forEach(function (lb) {
        var li = document.createElement('li');
        li.textContent = lb;
        axis.appendChild(li);
      });
    }
    setText('#moodFoot', D.mood.foot);
  }

  function renderGoals() {
    var ul = $('#goals');
    if (!ul || !D.goals) return;
    D.goals.forEach(function (g) {
      var li = document.createElement('li');
      li.className = 'reveal';
      li.innerHTML =
        '<span class="tick">✓</span>' +
        '<div>' +
          '<p class="g-text">' + esc(g.text) + '</p>' +
          (g.note ? '<p class="g-note">' + esc(g.note) + '</p>' : '') +
        '</div>';
      ul.appendChild(li);
    });
  }

  function renderMoments() {
    var box = $('#moments');
    if (!box || !D.moments) return;
    D.moments.forEach(function (m) {
      var fig = document.createElement('figure');
      fig.className = 'moment reveal';
      var html = '<blockquote>' + esc(m.quote) + '</blockquote>';
      if (m.photo) html += '<img src="' + esc(m.photo) + '" alt="" loading="lazy">';
      if (m.from) html += '<figcaption>' + esc(m.from) + '</figcaption>';
      fig.innerHTML = html;
      box.appendChild(fig);
    });
  }

  function renderWishes() {
    var ul = $('#wishes');
    if (!ul || !D.wishes) return;

    setText('#wishTip', D.wishTip);

    var counter = document.createElement('p');
    counter.className = 'wish-count reveal';

    function syncCount() {
      var done = $all('li.done', ul).length;
      counter.textContent = '已打勾 ' + done + ' / ' + D.wishes.length + ' 个愿望';
    }

    D.wishes.forEach(function (w) {
      var li = document.createElement('li');
      li.className = 'reveal';
      li.tabIndex = 0;
      li.setAttribute('role', 'checkbox');
      li.setAttribute('aria-checked', 'false');
      li.innerHTML = '<span class="box">✓</span>' +
        '<span class="w-text">' + esc(w) + '</span>';

      function toggle() {
        li.classList.toggle('done');
        li.setAttribute('aria-checked', li.classList.contains('done') ? 'true' : 'false');
        syncCount();
      }
      li.addEventListener('click', toggle);
      li.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }
      });
      ul.appendChild(li);
    });

    syncCount();
    ul.parentNode.insertBefore(counter, ul.nextSibling);
  }

  function renderEnd() {
    var e = D.end;
    if (!e) return;
    setText('#endEyebrow', e.eyebrow);
    setText('#endTitle', e.title);
    setText('#endSign', e.sign);

    var letter = $('#letter');
    if (letter && e.letter) {
      e.letter.forEach(function (p) {
        var el = document.createElement('p');
        el.textContent = p;
        letter.appendChild(el);
      });
    }
    setText('#eggBtn span', e.eggText || '点我');
  }

  function renderAll() {
    renderCover();
    renderTimeline();
    renderPlaces();
    renderStats();
    renderPhotos();
    renderCloud();
    renderMood();
    renderGoals();
    renderMoments();
    renderWishes();
    renderEnd();
  }

  /* ==================== 3. 翻页与导航 ==================== */

  var deck = $('#deck');
  var cards = $all('.card');
  var dots = $('#dots');
  var progress = $('#progress');

  function activeIndex() {
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].classList.contains('is-active')) return i;
    }
    return -1;
  }

  function buildDots() {
    if (!dots) return;
    cards.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', c.getAttribute('data-title') || ('第 ' + (i + 1) + ' 页'));
      b.addEventListener('click', function () { go(i); });
      dots.appendChild(b);
    });
  }

  function syncDots() {
    if (!dots) return;
    var idx = activeIndex();
    $all('button', dots).forEach(function (b, i) {
      b.setAttribute('aria-current', i === idx ? 'true' : 'false');
    });
  }

  function go(i) {
    if (i < 0 || i >= cards.length) return;
    cards[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ==================== 4. 入场动画与数字滚动 ==================== */

  function runCounters(card) {
    $all('[data-value]', card).forEach(function (node) {
      var target = parseFloat(node.getAttribute('data-value')) || 0;
      var dec = parseInt(node.getAttribute('data-dec') || '0', 10);
      var dur = 1100, t0 = null;

      node.textContent = fmt(0, dec);

      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);       // easeOutCubic
        node.textContent = fmt(target * eased, dec);
        if (p < 1) requestAnimationFrame(step);
        else node.textContent = fmt(target, dec);
      }
      requestAnimationFrame(step);
    });
  }

  function activate(card) {
    if (!card || card.classList.contains('is-active')) return;

    cards.forEach(function (c) {
      if (c !== card) c.classList.remove('is-active');
    });
    card.classList.add('is-active');

    // 元素依次入场：按顺序给每个 .reveal 递增延迟
    $all('.reveal', card).forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i * 80, 720) + 'ms';
    });

    runCounters(card);

    // 到最后一页自动撒一次爱心
    if (card.id === 'c11') spawnHearts(12);

    syncDots();
    if (progress) progress.style.width = progressWidth() + '%';
  }

  function progressWidth() {
    if (!deck) return 0;
    var max = deck.scrollHeight - deck.clientHeight;
    return max > 0 ? (deck.scrollTop / max) * 100 : 0;
  }

  /* 哪一张是「当前页」——按卡片是否覆盖视口垂直中线判定。
     ------------------------------------------------------------
     这里曾经用 intersectionRatio >= 0.55 判定，对高度等于一屏的卡片没问题，
     但 02 时间轴有 13 条内容、整卡约 1389px，比手机视口高得多：
       最大可见比例 = 视口高 / 卡片高
     视口高 764px 时刚好 0.550，再矮（750 / 727 / 664 …）就永远达不到阈值，
     于是这张卡片永远拿不到 .is-active，里面 13 条 .reveal 全部停在
     opacity:0 —— 整屏只剩标题，内容看着像没渲染出来。
     中线判定不依赖比例，超高卡片同样成立。 */
  function cardAtCenter() {
    if (!deck) return null;
    var mid = deck.scrollTop + deck.clientHeight / 2;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (mid >= c.offsetTop && mid < c.offsetTop + c.offsetHeight) return c;
    }
    return null;
  }

  function syncActive() {
    var c = cardAtCenter();
    if (c) activate(c);
    if (progress) progress.style.width = progressWidth() + '%';
  }

  function observeCards() {
    if (!deck || !cards.length) return;

    if (!('IntersectionObserver' in window)) {
      cards.forEach(function (c) { c.classList.add('is-active'); });
      runCounters(cards[0]);
      return;
    }

    // rootMargin 把判定区收成视口正中间 10% 高的一条带：
    // 只有当卡片盖住这条带（也就是盖住页面正中）才算当前页。
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) activate(en.target);
      });
    }, { root: deck, rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    cards.forEach(function (c) { io.observe(c); });

    // 兜底：滚动时每帧按中线校准一次，避免观测器在极端尺寸下漏判
    var ticking = false;
    deck.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; syncActive(); });
    }, { passive: true });

    syncActive();
  }

  /* ==================== 5. 背景音乐 ==================== */

  var audio = $('#bgm');
  var bgmBtn = $('#bgmBtn');
  var bgmLabel = $('#bgmLabel');
  var noAudio = $('#noAudio');
  var audioUnavailable = false;
  var musicInfo = D.music || null;

  // 把曲目信息渲染到按钮旁的小标签里（数据取自 data.js 的 music 段）
  function paintMusicInfo() {
    if (!musicInfo || !musicInfo.title) return;
    var text = '♪ ' + musicInfo.title;
    if (musicInfo.artist) text += ' · ' + musicInfo.artist;
    if (bgmLabel) {
      bgmLabel.textContent = text;
      bgmLabel.hidden = false;
    }
    if (bgmBtn) {
      bgmBtn.setAttribute('aria-label', '播放背景音乐：' + musicInfo.title +
        (musicInfo.artist ? ' - ' + musicInfo.artist : ''));
    }
  }

  function markUnavailable() {
    audioUnavailable = true;
    if (bgmBtn) {
      bgmBtn.disabled = true;
      bgmBtn.setAttribute('aria-pressed', 'false');
      bgmBtn.setAttribute('aria-label', '背景音乐不可用');
    }
    if (noAudio) noAudio.hidden = false;
  }

  function tryPlay() {
    if (!audio || audioUnavailable) return;
    var p = audio.play();
    // 自动播放被拦（NotAllowedError）不算故障，静默忽略
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  function initAudio() {
    paintMusicInfo();
    if (!audio) return;

    // preload="none" 时 <source> 的 error 不冒泡，用捕获阶段才收得到
    audio.addEventListener('error', markUnavailable, true);

    audio.addEventListener('play', function () {
      if (bgmBtn) bgmBtn.setAttribute('aria-pressed', 'true');
    });
    audio.addEventListener('pause', function () {
      if (bgmBtn) bgmBtn.setAttribute('aria-pressed', 'false');
    });

    if (bgmBtn) {
      bgmBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (audioUnavailable) return;
        if (audio.paused) tryPlay();
        else audio.pause();
      });
    }

    // 首次任意交互时尝试起播（移动端必须由用户手势触发）
    var started = false;
    function firstGesture(e) {
      if (started) return;
      // 点在按钮上时交给按钮自己的逻辑处理
      if (e && e.target && e.target.closest && e.target.closest('#bgmBtn')) return;
      started = true;
      tryPlay();
    }
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, firstGesture, { once: true, passive: true });
    });
  }

  /* ==================== 6. 飘落爱心彩蛋 ==================== */

  var hearts = $('#hearts');
  var GLYPHS = ['♥', '❤', '♡', '✿', '❀'];

  function spawnHearts(n) {
    if (!hearts) return;
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () {
          var h = document.createElement('i');
          h.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          h.style.left = (Math.random() * 94 + 2).toFixed(1) + '%';
          h.style.fontSize = (14 + Math.random() * 16).toFixed(0) + 'px';
          h.style.setProperty('--dx', ((Math.random() * 2 - 1) * 60).toFixed(0) + 'px');
          h.style.setProperty('--rot', ((Math.random() * 2 - 1) * 360).toFixed(0) + 'deg');
          h.style.setProperty('--s', (0.7 + Math.random() * 0.9).toFixed(2));

          var dur = 3.2 + Math.random() * 2.4;
          h.style.animationDuration = dur + 's';

          hearts.appendChild(h);
          setTimeout(function () { h.remove(); }, dur * 1000 + 240);
        }, i * 70);
      })(i);
    }
  }

  /* ==================== 启动 ==================== */

  function init() {
    renderAll();
    buildDots();
    observeCards();
    initAudio();

    // 兜底：若观察器没有及时触发，手动激活首屏卡片
    setTimeout(function () {
      if (activeIndex() === -1 && cards.length) activate(cards[0]);
    }, 320);

    if (deck) {
      deck.addEventListener('scroll', function () {
        if (progress) progress.style.width = progressWidth() + '%';
      }, { passive: true });
    }

    // 键盘翻页（桌面端）
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      // 焦点在交互控件上时不劫持按键
      if (t && t.closest && t.closest('.wishes li, .egg, .bgm, .dots')) return;

      var i = activeIndex();
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(i + 1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(i - 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(cards.length - 1); }
      else if (e.key === ' ' && t === document.body) { e.preventDefault(); go(i + 1); }
    });

    // 彩蛋按钮
    var eggBtn = $('#eggBtn');
    if (eggBtn) {
      eggBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        spawnHearts(30);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
