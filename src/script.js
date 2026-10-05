/* Fold — standalone Vanilla JS. Versions are pinned in the document head.
   No models, API keys, build tools, remote textures or server endpoints required. */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  let reduced = motionPreference.matches, lenis = null, animationContext = null;
  let modelAPI = null, activeScene = true, rafID = 0, previousTime = 0;
  const state = { fold: 156, targetFold: 156, story: 0, pointerX: 0, pointerY: 0, dragX: 0, dragY: 0, color: 'titanium' };
  const finishes = {
    titanium: { color: 0xa49b8a, title: 'Натуральный<br>титан.', plain: 'натуральный титан', description: 'Тёплый оттенок металла.<br>Сдержанный, но не незаметный.' },
    graphite: { color: 0x44464b, title: 'Глубокий<br>графит.', plain: 'графит', description: 'Глубина тёмного оттенка.<br>Выразительность чистой формы.' },
    silver: { color: 0xc9cccf, title: 'Чистое<br>серебро.', plain: 'серебристый', description: 'Свет на каждой грани.<br>Классика в новом измерении.' }
  };

  // Useful illustrations remain visible if WebGL or any CDN is unavailable.
  function fallbackImage(color = '#aaa497') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="900" viewBox="0 0 1000 900"><g transform="translate(205 210) rotate(-10 300 240)"><rect width="290" height="480" rx="30" fill="${color}"/><rect x="300" width="290" height="480" rx="30" fill="${color}"/><rect x="7" y="7" width="276" height="466" rx="26" fill="#222326"/><rect x="307" y="7" width="276" height="466" rx="26" fill="#222326"/><rect x="15" y="15" width="260" height="450" rx="20" fill="#9a9588"/><rect x="315" y="15" width="260" height="450" rx="20" fill="#3a4658"/><path d="M15 410Q100 220 275 100M315 100Q490 220 575 410" fill="none" stroke="#c5c1b1" stroke-width="25"/><path d="M15 440Q130 190 275 140M315 140Q460 190 575 440" fill="none" stroke="#dcd8ca" stroke-width="3"/><text x="57" y="83" fill="white" font-family="Arial" font-size="35">09:41</text></g></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  $$('img[id^="render-"]').forEach(img => { img.src = fallbackImage(); });

  function configureMotion() {
    if (animationContext) { animationContext.revert(); animationContext = null; }
    if (lenis) { lenis.destroy(); lenis = null; }
    document.body.classList.toggle('reduced-motion', reduced);
    $('#motion-toggle').setAttribute('aria-pressed', String(reduced));
    $('#motion-toggle').textContent = reduced ? 'Включить движение' : 'Уменьшить движение';
    state.story = 0;
    if (reduced) { stopAutoplay(); return; }
    if (window.Lenis && !coarsePointer.matches) {
      lenis = new Lenis({ duration: 1.15, smoothWheel: true, syncTouch: false, anchors: false });
      if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    }
    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      animationContext = gsap.context(() => {
        gsap.from('.hero h1 .line > span', { yPercent: 108, duration: 1.15, stagger: .12, ease: 'power3.out', delay: .12 });
        $$('.reveal').forEach(el => {
          gsap.from(el, { y: 30, opacity: 0, duration: .9, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 94%', once: true } });
        });
        gsap.to(state, { story: 1, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.1 } });
        gsap.to('.stage-watermark', { y: 70, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.5 } });
        gsap.fromTo('.editorial-word', { y: 70 }, { y: -60, ease: 'none', scrollTrigger: { trigger: '.design-section', start: 'top bottom', end: 'bottom top', scrub: 1.3 } });
      });
    }
  }
  $('#motion-toggle').addEventListener('click', () => { reduced = !reduced; configureMotion(); });
  motionPreference.addEventListener('change', event => { reduced = event.matches; configureMotion(); });

  // Native anchors remain a complete fallback if Lenis fails to load.
  $$('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    event.preventDefault();
    if (lenis && !reduced) lenis.scrollTo(target, { offset: -78, duration: 1.3 });
    else target.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    // URL history is deliberately left alone, so this also works with file://.
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
  }));

  function setFold(degrees) {
    state.targetFold = clamp(Number(degrees), 20, 180);
    $('#fold-range').value = String(state.targetFold);
    $('#fold-output').textContent = `${Math.round(state.targetFold)}°`;
    const closed = state.targetFold < 90;
    $('#fold-toggle').setAttribute('aria-pressed', String(closed));
    $('#fold-toggle').innerHTML = `${closed ? 'Раскрыть' : 'Сложить'} <span aria-hidden="true">↗</span>`;
  }
  $('#fold-range').addEventListener('input', e => setFold(e.target.value));
  $('#fold-toggle').addEventListener('click', () => setFold(state.targetFold < 90 ? 156 : 24));

  // Horizontal swipes rotate the model; vertical gestures retain page scrolling.
  const stage = $('#hero-stage');
  let drag = null;
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, startX: state.dragX, startY: state.dragY, id: e.pointerId };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    const rect = stage.getBoundingClientRect();
    if (!coarsePointer.matches) {
      state.pointerX = (e.clientX - rect.left) / rect.width * 2 - 1;
      state.pointerY = (e.clientY - rect.top) / rect.height * 2 - 1;
    }
    if (drag && drag.id === e.pointerId) {
      state.dragX = drag.startX + (e.clientX - drag.x) * .007;
      state.dragY = clamp(drag.startY + (e.clientY - drag.y) * .003, -.55, .55);
    }
  });
  const endDrag = e => { if (drag?.id === e.pointerId) { if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId); drag = null; } };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', () => { state.pointerX = 0; state.pointerY = 0; });
  new IntersectionObserver(entries => { activeScene = entries[0].isIntersecting; }, { rootMargin: '100px' }).observe(stage);

  // Highlights: native scroll-snap, keyboard controls, explicit autoplay.
  const carousel = $('#carousel'), cards = $$('.feature-card'), dots = $$('[data-slide]');
  let currentSlide = 0, autoplay = null, scrollDebounce;
  const slideNames = ['01 — Пространство', '02 — Материал', '03 — Движение'];
  function updateSlide(index) {
    currentSlide = index;
    dots.forEach((dot, i) => { dot.setAttribute('aria-current', String(i === index)); });
    $('#slide-caption').textContent = slideNames[index];
    $('#prev-slide').disabled = index === 0;
    $('#next-slide').disabled = index === cards.length - 1;
  }
  function goToSlide(index) {
    index = clamp(index, 0, cards.length - 1);
    const card = cards[index];
    const target = carousel.scrollLeft + card.getBoundingClientRect().left - carousel.getBoundingClientRect().left - (carousel.clientWidth - card.clientWidth) / 2;
    carousel.scrollTo({ left: target, behavior: reduced ? 'instant' : 'smooth' });
    updateSlide(index);
  }
  function stopAutoplay() {
    if (autoplay) clearInterval(autoplay);
    autoplay = null;
    $('#play-toggle').innerHTML = '<span aria-hidden="true">▶</span>';
    $('#play-toggle').setAttribute('aria-label', 'Включить автопоказ');
  }
  function startAutoplay() {
    stopAutoplay();
    autoplay = setInterval(() => goToSlide((currentSlide + 1) % cards.length), 4500);
    $('#play-toggle').innerHTML = '<span aria-hidden="true">Ⅱ</span>';
    $('#play-toggle').setAttribute('aria-label', 'Остановить автопоказ');
  }
  dots.forEach(dot => dot.addEventListener('click', () => { stopAutoplay(); goToSlide(Number(dot.dataset.slide)); }));
  $('#prev-slide').addEventListener('click', () => { stopAutoplay(); goToSlide(currentSlide - 1); });
  $('#next-slide').addEventListener('click', () => { stopAutoplay(); goToSlide(currentSlide + 1); });
  $('#play-toggle').addEventListener('click', () => autoplay ? stopAutoplay() : startAutoplay());
  $('#tour-button').addEventListener('click', () => { goToSlide((currentSlide + 1) % cards.length); if (!reduced) startAutoplay(); });
  carousel.addEventListener('pointerdown', stopAutoplay, { passive: true });
  carousel.addEventListener('focusin', stopAutoplay);
  carousel.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); stopAutoplay(); goToSlide(currentSlide + (e.key === 'ArrowRight' ? 1 : -1)); }
  });
  carousel.addEventListener('scroll', () => {
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      const center = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
      const distances = cards.map(card => Math.abs(card.getBoundingClientRect().left + card.clientWidth / 2 - center));
      updateSlide(distances.indexOf(Math.min(...distances)));
    }, 120);
  }, { passive: true });
  new IntersectionObserver(entries => { if (!entries[0].isIntersecting) stopAutoplay(); }).observe(carousel);
  updateSlide(0);

  const modes = {
    work: { heading: 'Две задачи.<br>Один момент.', copy: 'Маршрут рядом с планами. Заметки рядом с вдохновением. Всё важное — перед глазами.', date: 'ПОНЕДЕЛЬНИК, 21', title: 'Хороший день<br>для новых идей.', note: 'Замечать.<br>Пробовать.<br>Создавать.', right: 'НАЙДИТЕ СВОЮ<br>ТОЧКУ ЗРЕНИЯ.' },
    read: { heading: 'Ещё одна<br>глава.', copy: 'Привычный жест раскрывает новую историю. Больше текста на странице, больше пространства для воображения.', date: 'БИБЛИОТЕКА · ЭССЕ', title: 'Искусство<br>замечать.', note: '«В привычных вещах<br>всегда есть место<br>новому взгляду».', right: 'ГЛАВА 01<br>НАЧАЛО ПУТИ.' },
    view: { heading: 'Первый ряд.<br>Всегда с вами.', copy: 'Любимые истории занимают весь экран. Разверните устройство и устройтесь поудобнее.', date: 'КОЛЛЕКЦИЯ · КИНО', title: 'За пределами<br>привычного.', note: 'Короткая история<br>о большом<br>путешествии.', right: 'ДРУГАЯ<br>ПЕРСПЕКТИВА.' }
  };
  const tabs = $$('[data-mode][role="tab"]');
  function setMode(tab) {
    tabs.forEach(t => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1; });
    const mode = modes[tab.dataset.mode];
    $('#experience-heading').innerHTML = mode.heading;
    $('#experience-copy').textContent = mode.copy;
    $('.demo-date').textContent = mode.date;
    $('.demo-left > strong').innerHTML = mode.title;
    $('.demo-note p').innerHTML = mode.note;
    $('.demo-right > span').innerHTML = mode.right;
    $('.demo-screen').dataset.mode = tab.dataset.mode;
    $('#screen-demo').setAttribute('aria-labelledby', tab.id);
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => setMode(tab));
    tab.addEventListener('keydown', e => {
      let next;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { e.preventDefault(); tabs[next].focus(); setMode(tabs[next]); }
    });
  });

  $$('[data-color]').forEach(button => button.addEventListener('click', () => {
    state.color = button.dataset.color;
    const finish = finishes[state.color];
    $$('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    $('#color-name').innerHTML = finish.title;
    $('#color-description').innerHTML = finish.description;
    $('#render-color').alt = `Fold в цвете ${finish.plain}`;
    if (modelAPI) modelAPI.changeColor(finish.color);
    else $('#render-color').src = fallbackImage('#' + finish.color.toString(16).padStart(6, '0'));
  }));
  $('#back-to-model').addEventListener('click', () => { state.dragX = 0; state.dragY = 0; setFold(156); });

  // Magnetic effects never alter the element's layout or keyboard hit target.
  $$('.magnetic').forEach(button => {
    button.addEventListener('pointermove', e => {
      if (reduced || coarsePointer.matches || !window.gsap) return;
      const r = button.getBoundingClientRect();
      gsap.to(button, { x: (e.clientX - r.left - r.width / 2) * .18, y: (e.clientY - r.top - r.height / 2) * .22, duration: .35, overwrite: true });
    });
    button.addEventListener('pointerleave', () => { if (window.gsap) gsap.to(button, { x: 0, y: 0, duration: .55, ease: 'elastic.out(1,.6)' }); });
  });
  const cursor = $('#custom-cursor');
  const cursorState = { x: -100, y: -100, tx: -100, ty: -100 };
  document.addEventListener('pointermove', e => {
    if (coarsePointer.matches || reduced) return;
    cursorState.tx = e.clientX; cursorState.ty = e.clientY;
    cursor.style.opacity = '1';
    cursor.classList.toggle('drag', !!e.target.closest('#hero-stage'));
    cursor.classList.toggle('link', !!e.target.closest('a, button, input'));
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { cursor.style.opacity = '0'; });

  function createScene() {
    if (!window.THREE) throw new Error('Three.js unavailable');
    const T = THREE;
    const mobile = coarsePointer.matches || innerWidth < 700;
    const canvas = $('#product-canvas');
    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.75));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.setClearColor(0xffffff, 0);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(34, 1, .1, 100);
    camera.position.set(0, 0, 12.4);

    // A small generated photo studio supplies physically based metal reflections.
    const studio = new T.Scene();
    studio.add(new T.Mesh(new T.BoxGeometry(30, 24, 30), new T.MeshBasicMaterial({ color: 0xa8aaa9, side: T.BackSide })));
    function softbox(w, h, x, y, z, intensity) {
      const mesh = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(intensity, intensity, intensity), side: T.DoubleSide }));
      mesh.position.set(x, y, z); mesh.lookAt(0, 0, 0); studio.add(mesh);
    }
    softbox(5, 12, -8, 4, 6, 5); softbox(3, 14, 8, 3, 1, 4); softbox(12, 5, 0, 10, 3, 6); softbox(9, 9, 0, 0, -10, 2);
    const generator = new T.PMREMGenerator(renderer);
    const env = generator.fromScene(studio, .025, .1, 100);
    scene.environment = env.texture;
    generator.dispose();
    studio.traverse(obj => { if (obj.isMesh) { obj.geometry.dispose(); obj.material.dispose(); } });
    scene.add(new T.HemisphereLight(0xffffff, 0x696966, 2.1));
    const key = new T.DirectionalLight(0xfff8ee, 3.3); key.position.set(-4, 7, 6); scene.add(key);
    const fill = new T.DirectionalLight(0xe4edff, 1.8); fill.position.set(6, 1, 4); scene.add(fill);

    // Deterministic micro-brushing texture, generated locally and shared by metal parts.
    const grainCanvas = document.createElement('canvas'); grainCanvas.width = grainCanvas.height = 256;
    const grainContext = grainCanvas.getContext('2d'); const pixels = grainContext.createImageData(256, 256);
    let seed = 1973;
    for (let y = 0; y < 256; y++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const base = 125 + (seed / 4294967296 - .5) * 30;
      for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 4; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = base + Math.sin(x * .1) * 3; pixels.data[i + 3] = 255; }
    }
    grainContext.putImageData(pixels, 0, 0);
    const grain = new T.CanvasTexture(grainCanvas); grain.wrapS = grain.wrapT = T.RepeatWrapping; grain.repeat.set(2, 6);
    const metal = new T.MeshStandardMaterial({ color: finishes.titanium.color, metalness: .92, roughness: .3, bumpMap: grain, bumpScale: .012, envMapIntensity: 1.25 });
    const rim = new T.MeshStandardMaterial({ color: 0xceccc7, metalness: 1, roughness: .2, envMapIntensity: 1.1 });
    const glass = new T.MeshPhysicalMaterial({ color: 0x101114, metalness: .25, roughness: .18, clearcoat: 1 });
    const dark = new T.MeshStandardMaterial({ color: 0x101114, metalness: .5, roughness: .28 });
    const lens = new T.MeshPhysicalMaterial({ color: 0x152332, metalness: .75, roughness: .12, clearcoat: 1, envMapIntensity: 1.4 });
    const model = new T.Group(); scene.add(model);
    const panels = [];
    const w = 2.67, h = 5.28;

    function roundedShape(width, height, radius) {
      const s = new T.Shape(), x = -width / 2, y = -height / 2;
      s.moveTo(x + radius, y); s.lineTo(x + width - radius, y); s.quadraticCurveTo(x + width, y, x + width, y + radius);
      s.lineTo(x + width, y + height - radius); s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      s.lineTo(x + radius, y + height); s.quadraticCurveTo(x, y + height, x, y + height - radius);
      s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y); return s;
    }
    function plate(width, height, depth, radius, material) {
      const geo = new T.ExtrudeGeometry(roundedShape(width, height, radius), { depth, bevelEnabled: true, bevelSegments: mobile ? 2 : 4, steps: 1, bevelSize: .025, bevelThickness: .025, curveSegments: mobile ? 8 : 16 });
      geo.translate(0, 0, -depth / 2);
      return new T.Mesh(geo, material);
    }
    // The screen is a lit, folded mineral/silk field: depth belongs to the product.
    const uniforms = { uTime: { value: 0 }, uAccent: { value: new T.Vector3(.2, .26, .36) } };
    const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
    const fragmentShader = `precision highp float;
      varying vec2 vUv; uniform float uTime; uniform float uSide; uniform vec3 uAccent;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec2 uv=vec2((vUv.x+uSide)*.5,vUv.y);
        vec2 p=(uv-.5)*vec2(1.2,1.);
        float wing=abs(p.x);
        float bend=pow(wing+.04,.64);
        float flow=p.y*1.8+bend*2.2+.095*sin(p.y*6.+wing*5.+uTime*.07);
        float ribbons=sin(flow*20.+sin(flow*6.)*1.8);
        float fine=sin(flow*140.+ribbons*1.7);
        float broad=.5+.5*sin(flow*8.4);
        float ridge=pow(.5+.5*ribbons,9.);
        vec3 midnight=vec3(.035,.055,.095);
        vec3 pearl=vec3(.84,.82,.75);
        vec3 slate=uAccent;
        float sweep=smoothstep(-.18,.48,p.y+bend*.6);
        vec3 color=mix(midnight,slate,broad*.75);
        color=mix(color,pearl,sweep*(.56+.44*broad));
        color+=ridge*mix(vec3(.10,.15,.22),vec3(.20,.17,.12),sweep);
        color+=fine*.012;
        color*=.8+.2*smoothstep(0.,.055,abs(uv.x-.5));
        color+=(hash(gl_FragCoord.xy)-.5)*.018;
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
    function screen(width, height, side) {
      const geo = new T.ShapeGeometry(roundedShape(width, height, .17), mobile ? 12 : 24);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + width / 2) / width, (pos.getY(i) + height / 2) / height);
      const mat = new T.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...uniforms, uSide: { value: side } } });
      return new T.Mesh(geo, mat);
    }
    const sideSign = [-1, 1];
    sideSign.forEach((sign, index) => {
      const pivot = new T.Group(); model.add(pivot); panels.push(pivot);
      const cx = sign * (w / 2 + .022);
      const body = plate(w, h, .16, .23, metal); body.position.x = cx; pivot.add(body);
      const trim = plate(w - .022, h - .022, .019, .218, rim); trim.position.set(cx, 0, .096); pivot.add(trim);
      const bezel = plate(w - .066, h - .066, .017, .2, glass); bezel.position.set(cx, 0, .116); pivot.add(bezel);
      const display = screen(w - .17, h - .17, index); display.position.set(cx, 0, .155); pivot.add(display);
      // Inlaid antenna breaks and a machined side button.
      [-1.9, 1.9].forEach(y => {
        const antenna = new T.Mesh(new T.BoxGeometry(.012, .04, .13), new T.MeshStandardMaterial({ color: 0x666563, roughness: .8 }));
        antenna.position.set(sign * (w + .047), y, 0); pivot.add(antenna);
      });
      const button = new T.Mesh(new T.BoxGeometry(.026, .53, .068), rim); button.position.set(sign * (w + .052), .63, 0); pivot.add(button);
      // Rear hardware: cover display on one leaf, three optical assemblies on the other.
      if (index === 0) {
        const bump = plate(1.03, 2.02, .095, .23, metal); bump.position.set(cx - .57, 1.4, -.17); pivot.add(bump);
        for (let i = 0; i < 3; i++) {
          const cy = 2.03 - i * .63;
          const ring = new T.Mesh(new T.CylinderGeometry(.255, .255, .08, mobile ? 24 : 48), rim); ring.rotation.x = Math.PI / 2; ring.position.set(cx - .57, cy, -.258); pivot.add(ring);
          const blackRing = new T.Mesh(new T.CylinderGeometry(.219, .219, .083, mobile ? 24 : 48), dark); blackRing.rotation.x = Math.PI / 2; blackRing.position.set(cx - .57, cy, -.266); pivot.add(blackRing);
          const optic = new T.Mesh(new T.CylinderGeometry(.152, .152, .087, mobile ? 24 : 48), lens); optic.rotation.x = Math.PI / 2; optic.position.set(cx - .57, cy, -.277); pivot.add(optic);
          const dot = new T.Mesh(new T.SphereGeometry(.028, 10, 8), new T.MeshBasicMaterial({ color: 0x9fafbc })); dot.position.set(cx - .61, cy + .052, -.326); pivot.add(dot);
        }
        const flash = new T.Mesh(new T.CircleGeometry(.095, 20), new T.MeshStandardMaterial({ color: 0xf2e8d0, roughness: .5 })); flash.position.set(cx + .21, 1.99, -.112); flash.rotation.y = Math.PI; pivot.add(flash);
      } else {
        const coverBezel = plate(w - .17, h - .2, .016, .18, glass); coverBezel.position.set(cx, 0, -.111); pivot.add(coverBezel);
        const cover = screen(w - .29, h - .32, 1); cover.rotation.y = Math.PI; cover.position.set(cx, 0, -.147); pivot.add(cover);
      }
      // Speaker perforations: dark recessed points on the short bottom edge.
      for (let j = 0; j < 7; j++) {
        const hole = new T.Mesh(new T.CircleGeometry(.018, 8), dark); hole.rotation.x = Math.PI / 2; hole.position.set(cx + (j - 3) * .085, -h / 2 - .026, .004); pivot.add(hole);
      }
    });
    const hinge = new T.Mesh(new T.CylinderGeometry(.095, .095, h - .42, mobile ? 16 : 32), rim); hinge.position.z = -.017; model.add(hinge);
    [-2.35, 2.35].forEach(y => { const cap = new T.Mesh(new T.SphereGeometry(.096, 16, 12), metal); cap.scale.y = .6; cap.position.set(0, y, -.017); model.add(cap); });

    function pose(x, y, z, angle) { model.rotation.set(x, y, z); const a = (180 - angle) * Math.PI / 360; panels[0].rotation.y = a; panels[1].rotation.y = -a; }
    function resize() {
      const rect = stage.getBoundingClientRect();
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarsePointer.matches || rect.width < 700 ? 1.25 : 1.75));
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.position.z = camera.aspect < 1.3 ? 12.6 / Math.max(.7, camera.aspect) : 12.3;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize); observer.observe(stage); resize();

    // Reuse the same renderer for stills: no additional WebGL contexts on mobile.
    function snapshot(id, rotation, angle, distance = 12.4, width = 1000, height = 800) {
      const savedRotation = model.rotation.clone(), savedScale = model.scale.clone();
      const savedA = panels[0].rotation.y, savedB = panels[1].rotation.y;
      const aspect = camera.aspect, cameraZ = camera.position.z, pixelRatio = renderer.getPixelRatio();
      const size = renderer.getSize(new T.Vector2());
      renderer.setPixelRatio(1); renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.position.z = distance; camera.updateProjectionMatrix();
      pose(...rotation, angle); model.scale.setScalar(1);
      renderer.render(scene, camera);
      document.getElementById(id).src = canvas.toDataURL('image/png');
      model.rotation.copy(savedRotation); model.scale.copy(savedScale); panels[0].rotation.y = savedA; panels[1].rotation.y = savedB;
      camera.aspect = aspect; camera.position.z = cameraZ; camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio); renderer.setSize(size.x, size.y, false);
    }
    function colorSnapshot() { snapshot('render-color', [.15, 2.58, -.16], 65, 12, mobile ? 700 : 1000, mobile ? 630 : 900); }
    pose(.19, -.31, -.14, state.fold);
    renderer.render(scene, camera);
    snapshot('render-open', [.11, -.2, -.14], 171, 11.9);
    snapshot('render-back', [.16, 2.73, -.12], 160, 12.3);
    snapshot('render-folded', [.24, -.51, -.2], 62, 12.5);
    snapshot('render-detail', [.14, 2.1, -.28], 62, 11.1, mobile ? 700 : 1000, mobile ? 840 : 1200);
    colorSnapshot();
    renderer.render(scene, camera);
    document.body.classList.add('scene-ready');
    $('#scene-status').textContent = coarsePointer.matches ? 'Проведите по экрану, чтобы повернуть' : 'Живой объект. Ваша перспектива.';

    let contextLost = false;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); contextLost = true; document.body.classList.remove('scene-ready'); $('#scene-status').textContent = '3D-сцена приостановлена'; });
    canvas.addEventListener('webglcontextrestored', () => { contextLost = false; document.body.classList.add('scene-ready'); $('#scene-status').textContent = '3D-сцена восстановлена'; resize(); });
    let lastRendered = 0, lastStaticState = '';
    return {
      render(time, dt) {
        if (contextLost || !activeScene) return;
        if (mobile && time - lastRendered < 30) return;
        const staticState = `${state.targetFold}|${state.dragX}|${state.dragY}|${state.color}|${canvas.width}|${canvas.height}`;
        if (reduced && lastStaticState === staticState) return;
        lastStaticState = reduced ? staticState : '';
        lastRendered = time;
        const ease = reduced ? 1 : 1 - Math.exp(-dt * 7);
        state.fold += (state.targetFold - state.fold) * ease;
        const px = reduced ? 0 : state.pointerX * .12;
        const py = reduced ? 0 : state.pointerY * .055;
        const targetX = .19 + py + state.dragY + state.story * .22;
        const targetY = -.31 + px + state.dragX + state.story * .48;
        model.rotation.x += (targetX - model.rotation.x) * ease;
        model.rotation.y += (targetY - model.rotation.y) * ease;
        model.rotation.z += (-.14 + state.story * .08 - model.rotation.z) * ease;
        const angle = (180 - state.fold) * Math.PI / 360;
        panels[0].rotation.y = angle; panels[1].rotation.y = -angle;
        if (!reduced) uniforms.uTime.value = time * .001;
        renderer.render(scene, camera);
      },
      changeColor(color) { metal.color.setHex(color); colorSnapshot(); renderer.render(scene, camera); }
    };
  }
  try { modelAPI = createScene(); }
  catch (error) {
    console.warn('Fold: using static product illustrations.', error);
    $('#scene-status').textContent = 'Статичный вид — 3D недоступно в этом браузере';
    $('#fold-toggle').disabled = true; $('#fold-range').disabled = true;
    $('.interaction-hint span').textContent = 'Статичный вид устройства';
  }

  configureMotion();
  function frame(time) {
    const dt = Math.min((time - previousTime) / 1000 || .016, .05); previousTime = time;
    if (lenis) lenis.raf(time);
    if (modelAPI) modelAPI.render(time, dt);
    if (!reduced && !coarsePointer.matches) {
      const ease = 1 - Math.exp(-dt * 20);
      cursorState.x += (cursorState.tx - cursorState.x) * ease;
      cursorState.y += (cursorState.ty - cursorState.y) * ease;
      cursor.style.transform = `translate3d(${cursorState.x}px,${cursorState.y}px,0) translate(-50%,-50%)`;
    }
    rafID = requestAnimationFrame(frame);
  }
  rafID = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(rafID);
    if (document.hidden) stopAutoplay();
    else { previousTime = performance.now(); rafID = requestAnimationFrame(frame); }
  });
  document.fonts?.ready.then(() => { if (window.ScrollTrigger) ScrollTrigger.refresh(); });
});
