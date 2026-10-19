import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Globe from "react-globe.gl";
import "./App.css";

/* =====================  Sozlamalar va yordamchilar  ===================== */
const START = { name: "Uzbekistan", capital: "Tashkent", flag: "🇺🇿", lat: 41.31, lng: 69.24 };
const FALLBACK = [
  START,
  { name: "United States", capital: "Washington, D.C.", flag: "🇺🇸", lat: 38.9, lng: -77.04 },
  { name: "United Kingdom", capital: "London", flag: "🇬🇧", lat: 51.5, lng: -0.12 },
  { name: "Russia", capital: "Moscow", flag: "🇷🇺", lat: 55.75, lng: 37.62 },
  { name: "Japan", capital: "Tokyo", flag: "🇯🇵", lat: 35.68, lng: 139.69 },
  { name: "Brazil", capital: "Brasília", flag: "🇧🇷", lat: -15.79, lng: -47.88 },
  { name: "Egypt", capital: "Cairo", flag: "🇪🇬", lat: 30.04, lng: 31.24 },
  { name: "Australia", capital: "Canberra", flag: "🇦🇺", lat: -35.28, lng: 149.13 },
];

const PAL = {
  sun: [["#1b6dff", "#9ad8ff"], ["#040a22", "#1c2c63"]],
  cloud: [["#4d6488", "#b7c6d9"], ["#0b101d", "#2b3b57"]],
  rain: [["#18223a", "#4b6587"], ["#04070e", "#1a2639"]],
  snow: [["#6a8db6", "#f2f8fe"], ["#0f192d", "#4a6082"]],
};
const CLOUD_COLOR = { sun: [0xffffff, 0x39456e], cloud: [0xd5dde8, 0x2c3750], rain: [0x5a6880, 0x1c2433], snow: [0xf5f9fd, 0x6c7fa3] };
const HILL_COLOR = { sun: [0x3e9a55, 0x14382a], cloud: [0x5a7d6b, 0x1d2f38], rain: [0x3a5360, 0x131f28], snow: [0xf2f8ff, 0x7f93b3] };
const CELESTIAL = { sun: 1, cloud: 0.5, rain: 0, snow: 0.6 };
const DIR_LIGHT = { sun: 1.1, cloud: 0.8, rain: 0.5, snow: 0.9 };
const STARS = { sun: 1, cloud: 0.5, snow: 0.6, rain: 0.15 };
const DAYS = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

// WMO ob-havo kodi -> sahna turi, tavsif, ikonka
function wmo(code, night) {
  const r = (a, b) => code >= a && code <= b;
  if (code === 0) return { wk: "sun", d: "Ochiq osmon", icon: night ? "🌙" : "☀️" };
  if (code === 1) return { wk: "sun", d: "Asosan ochiq", icon: night ? "🌙" : "🌤️" };
  if (code === 2) return { wk: "cloud", d: "Qisman bulutli", icon: night ? "☁️" : "⛅" };
  if (code === 3) return { wk: "cloud", d: "Bulutli", icon: "☁️" };
  if (r(45, 48)) return { wk: "cloud", d: "Tuman", icon: "🌫️" };
  if (r(51, 55)) return { wk: "rain", d: "Mayda yomg'ir", icon: "🌦️" };
  if (r(56, 57)) return { wk: "rain", d: "Muzlovchi shivalash", icon: "🌧️" };
  if (r(61, 65)) return { wk: "rain", d: "Yomg'ir", icon: "🌧️" };
  if (r(66, 67)) return { wk: "rain", d: "Muzlovchi yomg'ir", icon: "🌧️" };
  if (r(71, 75)) return { wk: "snow", d: "Qor yog'moqda", icon: "🌨️" };
  if (code === 77) return { wk: "snow", d: "Qor donalari", icon: "❄️" };
  if (r(80, 82)) return { wk: "rain", d: "Jala", icon: "🌦️" };
  if (r(85, 86)) return { wk: "snow", d: "Qor jalasi", icon: "🌨️" };
  if (code === 95) return { wk: "rain", d: "Momaqaldiroq", icon: "⛈️", storm: true };
  if (r(96, 99)) return { wk: "rain", d: "Momaqaldiroq va do'l", icon: "⛈️", storm: true };
  return { wk: "cloud", d: "Noma'lum", icon: "☁️" };
}

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const K = Math.PI; // yangi three.js'da yorug'lik kuchini tenglashtirish
const pad = (n) => String(n).padStart(2, "0");
const dash = (v, f = (x) => x) => (v == null ? "—" : f(v));

/* =====================  three.js: ob-havo fon sahnasi  ===================== */
function makeTexture(draw, size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createScene(canvas, flashEl) {
  const glowTex = makeTexture((x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  }, 256);
  const rayTex = makeTexture((x, s) => {
    x.translate(s / 2, s / 2);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    g.addColorStop(0, "rgba(255,255,255,.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    for (let i = 0; i < 14; i++) {
      x.rotate((Math.PI * 2) / 14);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(-16, -s / 2); x.lineTo(16, -s / 2); x.fill();
    }
  }, 512);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.z = 10;
  scene.fog = new THREE.Fog(0x9ad8ff, 16, 48);

  const amb = new THREE.AmbientLight(0xffffff, 0.7 * K);
  const dir = new THREE.DirectionalLight(0xffffff, K);
  dir.position.set(5, 8, 6);
  const flashLight = new THREE.PointLight(0xaec6ff, 0, 40, 0);
  flashLight.position.set(0, 5, -2);
  scene.add(amb, dir, flashLight);

  const sprite = (map, opts) =>
    new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0, ...opts }));

  const sunG = new THREE.Group();
  const glow = sprite(glowTex, { color: 0xffd35a }); glow.scale.set(15, 15, 1);
  const rays = sprite(rayTex, { color: 0xffe9a0 }); rays.scale.set(22, 22, 1);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.3, 40, 40), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, fog: false, opacity: 0 }));
  sunG.add(rays, glow, core);

  const moonG = new THREE.Group();
  const mglow = sprite(glowTex, { color: 0x9fb4ff }); mglow.scale.set(9, 9, 1);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 40, 40), new THREE.MeshStandardMaterial({ color: 0xeef2ff, emissive: 0x8fa0cc, emissiveIntensity: 0.7, transparent: true, opacity: 0, fog: false }));
  moonG.add(mglow, moon);
  scene.add(sunG, moonG);

  const sa = new Float32Array(800 * 3);
  for (let i = 0; i < 800; i++) { sa[i * 3] = (Math.random() - 0.5) * 70; sa[i * 3 + 1] = -4 + Math.random() * 24; sa[i * 3 + 2] = -32; }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sa, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.55, map: glowTex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  scene.add(stars);

  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.95 });
  const clouds = Array.from({ length: 16 }, () => {
    const g = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.6, 1), cloudMat);
      m.position.set((j - 2) * 0.95, (Math.random() - 0.4) * 0.5, (Math.random() - 0.5) * 0.8);
      m.scale.y = 0.7;
      g.add(m);
    }
    g.position.set(-16 + Math.random() * 32, -0.5 + Math.random() * 5.5, -5 + Math.random() * 6);
    g.userData = { speed: 0.005 + Math.random() * 0.012, s: 0, base: 0.9 + Math.random() * 0.9 };
    g.scale.setScalar(0);
    scene.add(g);
    return g;
  });

  const hillMat = new THREE.MeshStandardMaterial({ color: 0x3e9a55, flatShading: true });
  for (let i = 0; i < 11; i++) {
    const h = 2.5 + Math.random() * 2.2;
    const m = new THREE.Mesh(new THREE.ConeGeometry(2 + Math.random() * 1.6, h, 5 + (i % 2), 1), hillMat);
    m.position.set(-13 + i * 2.6 + Math.random(), -6.6 + h / 2, -3 - Math.random() * 7);
    m.rotation.y = Math.random() * 3;
    scene.add(m);
  }

  const NR = 1400, rx = [], ry = [], rz = [];
  for (let i = 0; i < NR; i++) { rx.push((Math.random() - 0.5) * 30); ry.push(-7 + Math.random() * 15); rz.push(-6 + Math.random() * 10); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NR * 6), 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xbcd4ff, transparent: true, opacity: 0, fog: false }));
  rain.frustumCulled = false;
  scene.add(rain);

  const NS = 900, sx = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) { sx[i * 3] = (Math.random() - 0.5) * 28; sx[i * 3 + 1] = -7 + Math.random() * 15; sx[i * 3 + 2] = -6 + Math.random() * 12; }
  const sng = new THREE.BufferGeometry();
  sng.setAttribute("position", new THREE.BufferAttribute(sx, 3));
  const snow = new THREE.Points(sng, new THREE.PointsMaterial({ size: 0.4, map: glowTex, transparent: true, depthWrite: false, opacity: 0, fog: false }));
  snow.frustumCulled = false;
  scene.add(snow);

  let wk = "sun", storm = false, cloudN = 6, windK = 1, slant = 0.04;
  let t = 0, flash = 0, mx = 0, my = 0, raf = 0;
  const fx = { sun: 0, moon: 0, rain: 0, snow: 0, stars: 0 };
  const tg = { sun: 1, moon: 0, rain: 0, snow: 0, stars: 0 };
  const cT = new THREE.Color(), hT = new THREE.Color(), fT = new THREE.Color(), dT = new THREE.Color();
  let ambT = 0.7, dirT = 1;

  // haqiqiy ob-havo ma'lumotiga qarab sahnani sozlash
  function set({ wk: w, night, storm: s = false, cc = 30, wind = 10 }) {
    wk = w; storm = s;
    const i = night ? 1 : 0;
    tg.sun = night ? 0 : CELESTIAL[wk];
    tg.moon = night ? CELESTIAL[wk] : 0;
    tg.rain = wk === "rain" ? 1 : 0;
    tg.snow = wk === "snow" ? 1 : 0;
    tg.stars = night ? STARS[wk] : 0;
    cT.setHex(CLOUD_COLOR[wk][i]);
    hT.setHex(HILL_COLOR[wk][i]);
    fT.set(PAL[wk][i][1]);
    ambT = night ? 0.4 : 0.7;
    dirT = night ? 0.4 : DIR_LIGHT[wk];
    dT.setHex(night ? 0x8aa0ff : wk === "sun" ? 0xfff1d0 : 0xffffff);
    const n = Math.round(2 + (cc / 100) * 14);
    cloudN = wk === "rain" ? Math.max(12, n) : wk === "snow" ? Math.max(9, n) : n;
    windK = clamp(0.5 + wind / 20, 0.5, 3);
    slant = clamp(wind / 30, 0.2, 1) * 0.12;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const mobile = w < 700;
    sunG.position.set(mobile ? 2 : 6, mobile ? 4.2 : 3.6, -8);
    moonG.position.copy(sunG.position);
  }
  const onMove = (e) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onMove);
  resize();

  function loop() {
    raf = requestAnimationFrame(loop);
    t += 0.01;
    for (const k in fx) fx[k] = lerp(fx[k], tg[k], 0.04);

    sunG.visible = fx.sun > 0.01;
    core.material.opacity = fx.sun;
    glow.material.opacity = fx.sun * 0.9;
    rays.material.opacity = fx.sun * 0.7;
    rays.material.rotation += 0.003;
    glow.scale.setScalar(15 + Math.sin(t * 2) * 0.6);

    moonG.visible = fx.moon > 0.01;
    moon.material.opacity = fx.moon;
    mglow.material.opacity = fx.moon * 0.8;
    moon.rotation.y += 0.002;

    stars.visible = fx.stars > 0.01;
    stars.material.opacity = fx.stars * (0.75 + 0.25 * Math.sin(t * 3));

    cloudMat.color.lerp(cT, 0.04);
    hillMat.color.lerp(hT, 0.04);
    scene.fog.color.lerp(fT, 0.04);
    dir.color.lerp(dT, 0.04);
    amb.intensity = lerp(amb.intensity, ambT * K, 0.04);
    dir.intensity = lerp(dir.intensity, dirT * K, 0.04);

    clouds.forEach((g, i) => {
      const u = g.userData;
      u.s = lerp(u.s, i < cloudN ? u.base : 0, 0.03);
      g.scale.setScalar(u.s);
      g.visible = u.s > 0.02;
      g.position.x += u.speed * windK;
      if (g.position.x > 18) g.position.x = -18;
    });

    rain.visible = fx.rain > 0.01;
    if (rain.visible) {
      rain.material.opacity = fx.rain * 0.55;
      const a = rg.attributes.position.array;
      for (let i = 0; i < NR; i++) {
        ry[i] -= 0.4; rx[i] += slant * 0.5;
        if (ry[i] < -7) { ry[i] = 8; rx[i] = (Math.random() - 0.5) * 30; }
        a[i * 6] = rx[i]; a[i * 6 + 1] = ry[i]; a[i * 6 + 2] = rz[i];
        a[i * 6 + 3] = rx[i] - slant; a[i * 6 + 4] = ry[i] + 0.7; a[i * 6 + 5] = rz[i];
      }
      rg.attributes.position.needsUpdate = true;
      if (storm && Math.random() < 0.006) flash = 1;
    }
    flash *= 0.9;
    flashLight.intensity = flash * 12 * K;
    if (flashEl) flashEl.style.opacity = String(flash * 0.4);

    snow.visible = fx.snow > 0.01;
    if (snow.visible) {
      snow.material.opacity = fx.snow * 0.9;
      const a = sng.attributes.position.array;
      for (let i = 0; i < NS; i++) {
        a[i * 3 + 1] -= 0.03 + (i % 5) * 0.006;
        a[i * 3] += Math.sin(t * 3 + i) * 0.006;
        if (a[i * 3 + 1] < -7) a[i * 3 + 1] = 8;
      }
      sng.attributes.position.needsUpdate = true;
    }

    camera.position.x += (mx * 2.4 - camera.position.x) * 0.05;
    camera.position.y += (-my * 1.6 + 1 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  loop();

  function dispose() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onMove);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    glowTex.dispose(); rayTex.dispose();
    renderer.dispose();
  }
  return { set, dispose };
}

/* =====================  React qismi  ===================== */
function Card({ className = "", children }) {
  const onMove = (e) => {
    const el = e.currentTarget, b = el.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    el.style.transform = `rotateY(${x * 24}deg) rotateX(${-y * 24}deg) translateZ(14px)`;
  };
  const onLeave = (e) => { e.currentTarget.style.transform = ""; };
  return (
    <div className={`card ${className}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </div>
  );
}

function useSize(ref) {
  const [s, setS] = useState({ w: 400, h: 420 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setS({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return s;
}

export default function App() {
  const [countries, setCountries] = useState(FALLBACK);
  const [place, setPlace] = useState(START);
  const [w, setW] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [retry, setRetry] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const canvasRef = useRef(null), flashRef = useRef(null), sceneRef = useRef(null);
  const globeRef = useRef(null), boxRef = useRef(null);
  const size = useSize(boxRef);

  // 1) Barcha davlatlar va poytaxtlar (REST Countries)
  useEffect(() => {
    const ac = new AbortController();
    fetch("https://restcountries.com/v3.1/all?fields=name,capital,capitalInfo,latlng,flag,cca2", { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((data) => {
        const list = data
          .map((c) => {
            const ll = c.capitalInfo?.latlng?.length === 2 ? c.capitalInfo.latlng : c.latlng;
            if (!ll || ll.length < 2) return null;
            return { name: c.name.common, capital: c.capital?.[0] || c.name.common, flag: c.flag, lat: ll[0], lng: ll[1] };
          })
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name));
        if (list.length) setCountries(list);
      })
      .catch(() => {}); // internet bo'lmasa, qisqa zaxira ro'yxat qoladi
    return () => ac.abort();
  }, []);

  // 2) Tanlangan joyning haqiqiy ob-havosi (Open-Meteo)
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true); setErr("");
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,surface_pressure,wind_speed_10m,visibility` +
      `&hourly=temperature_2m,weather_code,is_day` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max` +
      `&timezone=auto&forecast_days=6`;
    fetch(url, { signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { setW(d); setLoading(false); })
      .catch((e) => { if (e.name !== "AbortError") { setErr("Ob-havoni yuklab bo'lmadi. Internetni tekshiring."); setLoading(false); } });
    return () => ac.abort();
  }, [place, retry]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);

  // Ma'lumotdan hosilalar
  const cur = w?.current;
  const night = cur ? cur.is_day === 0 : false;
  const info = cur ? wmo(cur.weather_code, night) : { wk: "sun", d: "Yuklanmoqda…", icon: "⛅" };
  const wk = info.wk;
  const light = wk === "snow" && !night;
  const pal = PAL[wk][night ? 1 : 0];

  // 3) Fon sahnasi
  useEffect(() => {
    const s = createScene(canvasRef.current, flashRef.current);
    sceneRef.current = s;
    return () => s.dispose();
  }, []);
  useEffect(() => {
    sceneRef.current?.set({ wk, night, storm: !!info.storm, cc: cur?.cloud_cover ?? 30, wind: cur?.wind_speed_10m ?? 10 });
  }, [w]); // eslint-disable-line react-hooks/exhaustive-deps

  // 4) Globus: tanlangan joyga uchish
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.controls().autoRotate = false;
    g.pointOfView({ lat: place.lat, lng: place.lng, altitude: 1.6 }, 1200);
  }, [place]);

  const points = useMemo(
    () => [...countries.map((c) => ({ ...c, sel: false })), { ...place, sel: true }],
    [countries, place]
  );
  const choose = (p) => { setPlace(p); setQ(""); setOpen(false); };
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? countries.filter((c) => `${c.name} ${c.capital}`.toLowerCase().includes(s)).slice(0, 8) : [];
  }, [q, countries]);
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => choose({ name: "Mening joyim", capital: "Joriy joylashuv", flag: "📍", lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setErr("Joylashuvga ruxsat berilmadi.")
    );

  // Joy vaqti
  const local = new Date(now + (w?.utc_offset_seconds ?? 0) * 1000);
  const clock = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;

  // Soatlik va kunlik
  const hours = useMemo(() => {
    if (!w) return [];
    const { time, temperature_2m: tt, weather_code: wc, is_day: id } = w.hourly;
    let idx = time.indexOf(`${w.current.time.slice(0, 13)}:00`);
    if (idx < 0) idx = 0;
    return Array.from({ length: 8 }, (_, i) => idx + i * 2)
      .filter((j) => j < time.length)
      .map((j) => ({ h: time[j].slice(11, 16), t: Math.round(tt[j]), icon: wmo(wc[j], id[j] === 0).icon }));
  }, [w]);
  const days = useMemo(() => {
    if (!w) return [];
    const d = w.daily;
    return d.time.slice(1, 6).map((date, i) => ({
      day: DAYS[new Date(`${date}T12:00:00`).getDay()],
      hi: Math.round(d.temperature_2m_max[i + 1]),
      lo: Math.round(d.temperature_2m_min[i + 1]),
      icon: wmo(d.weather_code[i + 1], false).icon,
    }));
  }, [w]);

  const stats = cur
    ? [
        ["💧 Namlik", `${cur.relative_humidity_2m}%`],
        ["💨 Shamol", `${Math.round(cur.wind_speed_10m)} km/s`],
        ["🧭 Bosim", `${Math.round(cur.surface_pressure)} hPa`],
        ["👁️ Ko'rinish", dash(cur.visibility, (v) => `${Math.round(v / 1000)} km`)],
        ["☁️ Bulutlilik", `${cur.cloud_cover}%`],
        ["🔆 UV indeks", dash(w.daily.uv_index_max[0], (v) => Math.round(v))],
        ["☔ Yog'in ehtimoli", dash(w.daily.precipitation_probability_max[0], (v) => `${v}%`)],
      ]
    : [];

  const style = {
    "--bg1": pal[0], "--bg2": pal[1],
    "--text": light ? "#0d2340" : "#ffffff",
    "--glass": light ? "rgba(255,255,255,.42)" : "rgba(255,255,255,.15)",
    "--line": light ? "rgba(255,255,255,.7)" : "rgba(255,255,255,.3)",
  };

  return (
    <div className="wx" style={style}>
      <canvas ref={canvasRef} className="wx-canvas" />
      <div ref={flashRef} className="wx-flash" />
      <main>
        <header>
          <div className="logo">🌍 OB-HAVO 3D</div>
          <div className="search">
            <input
              value={q}
              placeholder="Davlat yoki poytaxt qidiring…"
              onChange={(e) => { setQ(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && matches.length > 0 && (
              <div className="dd">
                {matches.map((c) => (
                  <button key={c.name} onMouseDown={() => choose(c)}>
                    {c.flag} {c.name} <small>{c.capital}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="right">
            <button className="btn" onClick={locate}>📍 Mening joyim</button>
            <span>{clock}</span>
          </div>
        </header>

        <div className="top">
          <section className="hero">
            <div className="city">{place.flag} {place.name} · {place.capital}</div>
            <div className="temp">{cur ? `${Math.round(cur.temperature_2m)}°` : "…"}</div>
            <div className="desc">{info.icon} {info.d}</div>
            {cur && (
              <div className="sub">
                Seziladi {Math.round(cur.apparent_temperature)}° · Yuqori {Math.round(w.daily.temperature_2m_max[0])}° · Quyi {Math.round(w.daily.temperature_2m_min[0])}°
              </div>
            )}
            {loading && <div className="sub">Yangilanmoqda…</div>}
            {err && (
              <div className="sub err">
                {err} <button className="btn pe" onClick={() => setRetry((n) => n + 1)}>Qayta urinish</button>
              </div>
            )}
          </section>

          <div className="globe-card" ref={boxRef}>
            <Globe
              ref={globeRef}
              width={size.w}
              height={size.h}
              backgroundColor="rgba(0,0,0,0)"
              globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
              bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
              atmosphereColor="#9ad8ff"
              atmosphereAltitude={0.22}
              pointsData={points}
              pointLat="lat"
              pointLng="lng"
              pointColor={(d) => (d.sel ? "#ffd54a" : "#ff5a5f")}
              pointAltitude={(d) => (d.sel ? 0.14 : 0.012)}
              pointRadius={(d) => (d.sel ? 0.55 : 0.26)}
              pointLabel={(d) => `${d.flag || ""} ${d.name} — ${d.capital}`}
              onPointClick={(p) => choose({ name: p.name, capital: p.capital, flag: p.flag, lat: p.lat, lng: p.lng })}
              onGlobeClick={({ lat, lng }) =>
                choose({ name: "Tanlangan nuqta", capital: `${lat.toFixed(1)}°, ${lng.toFixed(1)}°`, flag: "📍", lat, lng })
              }
              ringsData={[place]}
              ringLat="lat"
              ringLng="lng"
              ringColor={() => "#ffd54a"}
              ringMaxRadius={4}
              ringPropagationSpeed={3}
              ringRepeatPeriod={1200}
              onGlobeReady={() => {
                const c = globeRef.current.controls();
                c.autoRotate = true;
                c.autoRotateSpeed = 0.5;
                globeRef.current.pointOfView({ lat: place.lat, lng: place.lng, altitude: 2.2 }, 0);
              }}
            />
            <div className="hint">Nuqtani bosing yoki globusning istalgan joyini tanlang</div>
          </div>
        </div>

        {cur && (
          <>
            <h2>Hozir</h2>
            <div className="grid">
              {stats.map(([label, value]) => (
                <Card key={label}><small>{label}</small><b>{value}</b></Card>
              ))}
            </div>

            <h2>Soatlik</h2>
            <div className="row hr">
              {hours.map((x) => (
                <Card key={x.h}><small>{x.h}</small><span>{x.icon}</span><b>{x.t}°</b></Card>
              ))}
            </div>

            <h2>5 kunlik prognoz</h2>
            <div className="row fc">
              {days.map((x) => (
                <Card key={x.day + x.hi}>
                  <small>{x.day}</small><span>{x.icon}</span><b>{x.hi}°</b><small className="lo">{x.lo}°</small>
                </Card>
              ))}
            </div>
          </>
        )}

        <footer>Ob-havo: Open-Meteo · Davlatlar: REST Countries · Globus: three-globe</footer>
      </main>
    </div>
  );
}