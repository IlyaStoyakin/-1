(() => {
  'use strict';

  const hero = document.getElementById('hero');
  const bg = hero.querySelector('.bg');
  const glow = document.getElementById('bgGlow');
  const cursor = hero.querySelector('.cursor');
  const heads = [...hero.querySelectorAll('.head')];
  const words = [...hero.querySelectorAll('.ring__word')];
  const texts = [...hero.querySelectorAll('.text')];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Мимика голов ----------
     Лицо — растровая картинка, поэтому эмоции делаем SVG-фильтром feDisplacementMap:
     серая «карта смещения» двигает пиксели в нужных местах (брови, уголки рта, веки).
     Карта собирается из слоёв, координаты — в px макета внутри блока головы.
       blob — пятно радиуса r, сдвигающее картинку на (mx, my) px (вправо/вниз — плюс);
       lens — эллипс rx × ry: mx / my > 0 раздвигает картинку от центра (увеличивает),
              < 0 стягивает к центру (прищуривает). */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const S0 = 90; // сила фильтра при p = 1: максимальное смещение — S0 / 2 px макета

  const FACES = {
    // клиент — удивление: брови вверх, глаза шире
    client: {
      size: [282, 327],
      spring: { k: 520, damp: 22 },
      layers: [
        { type: 'blob', cx: 102, cy: 143, r: 38, mx: 0, my: -12 },
        { type: 'blob', cx: 187, cy: 141, r: 38, mx: 0, my: -12 },
        { type: 'lens', cx: 102, cy: 171, rx: 32, ry: 22, mx: 5, my: 4.5 },
        { type: 'lens', cx: 185, cy: 172, rx: 32, ry: 22, mx: 5, my: 4.5 },
      ],
    },
    // застройщик — улыбка: рот шире, уголки и щёки вверх, глаза прищуриваются
    developer: {
      size: [285, 342],
      spring: { k: 160, damp: 20 },
      layers: [
        { type: 'lens', cx: 142, cy: 268, rx: 70, ry: 30, mx: 7, my: 0 },
        { type: 'blob', cx: 97, cy: 270, r: 38, mx: -6, my: -14 },
        { type: 'blob', cx: 188, cy: 270, r: 38, mx: 6, my: -14 },
        { type: 'blob', cx: 58, cy: 210, r: 50, mx: 0, my: -11 },
        { type: 'blob', cx: 228, cy: 210, r: 50, mx: 0, my: -11 },
      ],
    },
    // агент — подмигивание: бровь опускается, щека поднимается (веко — отдельный слой, см. styles.css)
    agent: {
      size: [254, 311],
      layers: [
        { type: 'blob', cx: 85, cy: 130, r: 28, mx: 0, my: 7 },
        { type: 'blob', cx: 62, cy: 184, r: 32, mx: 0, my: -8 },
      ],
    },
  };
  const channel = (m) => Math.max(0, Math.min(255, Math.round(128 - (m / S0) * 255)));

  function displacementMap(axis, face) {
    const [w, h] = face.size;
    const rgb = (v) => (axis === 'x' ? `rgb(${v},128,128)` : `rgb(128,${v},128)`);
    const flat = 'rgb(128,128,128)';
    let defs = '';
    let shapes = '';

    face.layers.forEach((layer, i) => {
      const m = axis === 'x' ? layer.mx : layer.my;
      if (!m) return;

      if (layer.type === 'blob') {
        defs += `<radialGradient id="b${i}"><stop offset="0" stop-color="${rgb(channel(m))}"/><stop offset="1" stop-color="${flat}"/></radialGradient>`;
        shapes += `<circle cx="${layer.cx}" cy="${layer.cy}" r="${layer.r}" fill="url(#b${i})"/>`;
        return;
      }

      const a = Math.round((m / S0) * 255);
      const horizontal = axis === 'x';
      defs +=
        `<linearGradient id="l${i}" x1="0" y1="0" x2="${horizontal ? 1 : 0}" y2="${horizontal ? 0 : 1}">` +
        `<stop offset="0" stop-color="${flat}"/><stop offset=".25" stop-color="${rgb(128 + a)}"/>` +
        `<stop offset=".5" stop-color="${flat}"/><stop offset=".75" stop-color="${rgb(128 - a)}"/>` +
        `<stop offset="1" stop-color="${flat}"/></linearGradient>` +
        `<radialGradient id="f${i}"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>` +
        `<mask id="m${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">` +
        `<ellipse cx="${layer.cx}" cy="${layer.cy}" rx="${layer.rx}" ry="${layer.ry}" fill="url(#f${i})"/></mask>`;
      shapes += `<rect x="${layer.cx - layer.rx}" y="${layer.cy - layer.ry}" width="${layer.rx * 2}" height="${layer.ry * 2}" fill="url(#l${i})" mask="url(#m${i})"/>`;
    });

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
      `<defs>${defs}</defs><rect width="${w}" height="${h}" fill="${flat}"/>${shapes}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function buildFilter(role, face) {
    const filter = svgEl('filter', {
      id: `fx-${role}`, x: 0, y: 0, width: 1, height: 1, 'color-interpolation-filters': 'sRGB',
    });
    const mapImage = (axis, result) => {
      const img = svgEl('feImage', { preserveAspectRatio: 'none', result });
      const uri = displacementMap(axis, face);
      img.setAttribute('href', uri);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', uri);
      return img;
    };
    // сначала смещение по X (канал R карты), затем по Y (канал G другой карты)
    const dx = svgEl('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'mapX', scale: 0, xChannelSelector: 'R', yChannelSelector: 'B', result: 'moved',
    });
    const dy = svgEl('feDisplacementMap', {
      in: 'moved', in2: 'mapY', scale: 0, xChannelSelector: 'B', yChannelSelector: 'G',
    });
    filter.append(mapImage('x', 'mapX'), dx, mapImage('y', 'mapY'), dy);
    document.getElementById('fxDefs').append(filter);
    return { dx, dy };
  }

  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  // подмигивание: глаз закрывается, секунду держится, открывается
  const WINK = { close: 0.14, hold: 0.62, open: 0.84 }; // секунды, синхронно с @keyframes wink-lid
  const winkAt = (t) => {
    if (t < WINK.close) return ease(t / WINK.close);
    if (t < WINK.hold) return 1;
    if (t < WINK.open) return 1 - ease((t - WINK.hold) / (WINK.open - WINK.hold));
    return 0;
  };

  const faces = reduceMotion
    ? []
    : heads.map((el) => {
        const role = el.dataset.role;
        const cfg = FACES[role];
        return { role, el, cfg, ...buildFilter(role, cfg), p: 0, v: 0, target: 0, since: 0 };
      });

  let fxRaf = 0;
  let fxLast = 0;

  function fxFrame(now) {
    const dt = Math.min(0.05, (now - fxLast) / 1000 || 0.016);
    fxLast = now;
    let busy = false;

    faces.forEach((f) => {
      if (f.role === 'agent') {
        if (f.target) f.p = winkAt((now - f.since) / 1000);
        else f.p = Math.max(0, f.p - dt / 0.15);
        busy = busy || f.p > 0.001 || (f.target && (now - f.since) / 1000 < WINK.open);
      } else {
        const { k, damp } = f.cfg.spring;
        f.v += ((f.target - f.p) * k - f.v * damp) * dt;
        f.p += f.v * dt;
        const settled = Math.abs(f.v) < 0.002 && Math.abs(f.target - f.p) < 0.002;
        if (settled) { f.p = f.target; f.v = 0; }
        busy = busy || !settled;
      }

      const px = f.el.offsetWidth / f.cfg.size[0];
      const scale = (S0 * f.p * px).toFixed(2);
      f.dx.setAttribute('scale', scale);
      f.dy.setAttribute('scale', scale);
      f.el.classList.toggle('is-fx', Math.abs(f.p) > 0.001);
    });

    fxRaf = busy ? requestAnimationFrame(fxFrame) : 0;
  }

  function startFx() {
    if (!fxRaf && faces.length) {
      fxLast = performance.now();
      fxRaf = requestAnimationFrame(fxFrame);
    }
  }

  /* ---------- Активная голова (клиент / застройщик / агент) ---------- */

  let active = null;

  function setActive(role) {
    if (role === active) return;
    active = role;

    if (role) hero.dataset.active = role;
    else delete hero.dataset.active;

    heads.forEach((el) => el.classList.toggle('is-active', el.dataset.role === role));
    words.forEach((el) => el.classList.toggle('is-active', el.dataset.role === role));
    texts.forEach((el) => el.classList.toggle('is-on', el.dataset.for === (role || 'idle')));

    const now = performance.now();
    faces.forEach((f) => {
      const on = f.role === role;
      if (on && !f.target) f.since = now;
      f.target = on ? 1 : 0;
    });
    startFx();
  }

  const roleOf = (el) => (el && el.closest ? el.closest('[data-role]') : null);

  hero.addEventListener('pointerover', (e) => {
    const target = roleOf(e.target);
    setActive(target ? target.dataset.role : null);
  });

  hero.addEventListener('pointerleave', () => setActive(null));

  heads.forEach((el) => {
    el.addEventListener('focus', () => setActive(el.dataset.role));
    el.addEventListener('blur', () => setActive(null));
  });

  /* ---------- Жёлтое свечение фона, следующее за курсором ---------- */

  const BG = { w: 1944.717, h: 794.24 };
  const IDLE = { x: 972.398, y: 411 };
  const RADIUS = { v: 316, h: 773.734 };

  const pos = { ...IDLE };
  const target = { ...IDLE };
  let raf = 0;

  function paintGlow() {
    glow.setAttribute(
      'gradientTransform',
      `translate(${pos.x.toFixed(2)} ${pos.y.toFixed(2)}) rotate(90) scale(${RADIUS.v} ${RADIUS.h})`
    );
  }

  function tick() {
    pos.x += (target.x - pos.x) * 0.12;
    pos.y += (target.y - pos.y) * 0.12;
    paintGlow();

    if (Math.abs(target.x - pos.x) > 0.05 || Math.abs(target.y - pos.y) > 0.05) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  }

  function moveGlowTo(x, y) {
    target.x = x;
    target.y = y;
    if (reduceMotion) {
      pos.x = x;
      pos.y = y;
      paintGlow();
    } else if (!raf) {
      raf = requestAnimationFrame(tick);
    }
  }

  /* ---------- Курсор ---------- */

  const HOTSPOT = { x: 4.5, y: 0 };

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;

    hero.classList.add('has-cursor');
    cursor.classList.add('is-visible');
    cursor.style.transform = `translate3d(${e.clientX - HOTSPOT.x}px, ${e.clientY - HOTSPOT.y}px, 0)`;

    const r = bg.getBoundingClientRect();
    moveGlowTo(((e.clientX - r.left) / r.width) * BG.w, ((e.clientY - r.top) / r.height) * BG.h);
  });

  hero.addEventListener('pointerleave', () => {
    cursor.classList.remove('is-visible');
    moveGlowTo(IDLE.x, IDLE.y);
  });
})();
