"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// トップページの背景に敷く3Dシーン。
// 水面にペンライトの灯りが並び、スクロールするとカメラが水面を越えて深く潜っていく。
//  * 3Dライブラリは表示時にだけ読み込む(他の画面の読み込みを重くしない)
//  * 「視差効果を減らす」設定の端末では動かさず、静止画として描く
//  * WebGLが使えない端末では children(CSSで描いた灯り)をそのまま表示する

const COLORS = ["#E5484D", "#F08A24", "#E8C21A", "#8CC63F", "#5FD3B4", "#3FC8E4", "#3B6FE0", "#8E5AD6", "#EC6FA9"];

const THEME = {
  light: { top: "#f1f7f9", deep: "#b4d6e2", water: "#0a7c9c", additive: false, lines: 0.45 },
  dark: { top: "#06141f", deep: "#020a11", water: "#3fc8e4", additive: true, lines: 0.8 },
};

const CROWD = 150; // 水面に立つ灯り
const SUNKEN = 70; // 水中を漂う灯り
const BUBBLES = 260;

// 乱数は固定の種から作る(毎回同じ並びになり、表示のたびに印象が変わらない)
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function OceanScene({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
      } catch {
        return; // WebGL非対応: CSSの灯りを表示したままにする
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const random = seeded(20261110);
      const scene = new THREE.Scene();
      const fog = new THREE.FogExp2(0x000000, 0.04);
      scene.fog = fog;
      const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);

      // --- 灯り(棒)。本体と、ひと回り大きい光のにじみを重ねる ---
      const stick = new THREE.CapsuleGeometry(0.045, 0.85, 4, 10);
      const halo = new THREE.CapsuleGeometry(0.11, 0.9, 4, 10);
      const coreMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
      const haloMaterial = new THREE.MeshBasicMaterial({
        toneMapped: false,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const mirrorMaterial = new THREE.MeshBasicMaterial({
        toneMapped: false,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      });

      const total = CROWD + SUNKEN;
      const cores = new THREE.InstancedMesh(stick, coreMaterial, total);
      const halos = new THREE.InstancedMesh(halo, haloMaterial, total);
      const mirrors = new THREE.InstancedMesh(stick, mirrorMaterial, CROWD);

      type Stick = { x: number; y: number; z: number; phase: number; speed: number; tilt: number; spin: number };
      const sticks: Stick[] = [];
      const color = new THREE.Color();
      for (let i = 0; i < total; i++) {
        const isCrowd = i < CROWD;
        const item: Stick = isCrowd
          ? {
              x: (random() - 0.5) * 26,
              y: 0.55 + random() * 0.5,
              z: -1.5 - random() * 20,
              phase: random() * Math.PI * 2,
              speed: 0.7 + random() * 0.8,
              tilt: 0.12 + random() * 0.2,
              spin: 0,
            }
          : {
              x: (random() - 0.5) * 22,
              y: -1.2 - random() * 11,
              z: 2 - random() * 16,
              phase: random() * Math.PI * 2,
              speed: 0.15 + random() * 0.25,
              tilt: random() * Math.PI,
              spin: (random() - 0.5) * 0.3,
            };
        sticks.push(item);
        color.set(COLORS[Math.floor(random() * COLORS.length)]);
        cores.setColorAt(i, color);
        halos.setColorAt(i, color);
        if (isCrowd) mirrors.setColorAt(i, color);
      }
      scene.add(cores, halos, mirrors);

      // --- 水面: ゆっくり流れる波紋の線 ---
      const waterUniforms = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color() },
        uOpacity: { value: 0.5 },
      };
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 90, 1, 1),
        new THREE.ShaderMaterial({
          uniforms: waterUniforms,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          vertexShader: `
            varying vec3 vWorld;
            void main() {
              vec4 world = modelMatrix * vec4(position, 1.0);
              vWorld = world.xyz;
              gl_Position = projectionMatrix * viewMatrix * world;
            }`,
          fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            uniform float uOpacity;
            varying vec3 vWorld;
            void main() {
              vec2 p = vWorld.xz;
              float drift = sin(p.x * 0.9 + uTime * 0.5) * sin(p.y * 1.3 - uTime * 0.35);
              float band = sin((p.y + drift * 0.7) * 5.0 + uTime * 0.8) * 0.5 + 0.5;
              float line = smoothstep(0.93, 1.0, band);
              float fade = 1.0 - smoothstep(6.0, 34.0, length(p - cameraPosition.xz));
              gl_FragColor = vec4(uColor, (0.07 + line * 0.5) * fade * uOpacity);
            }`,
        }),
      );
      water.rotation.x = -Math.PI / 2;
      scene.add(water);

      // --- 泡 ---
      const bubblePositions = new Float32Array(BUBBLES * 3);
      const bubbleSpeeds = new Float32Array(BUBBLES);
      for (let i = 0; i < BUBBLES; i++) {
        bubblePositions[i * 3] = (random() - 0.5) * 24;
        bubblePositions[i * 3 + 1] = -random() * 13;
        bubblePositions[i * 3 + 2] = 4 - random() * 18;
        bubbleSpeeds[i] = 0.25 + random() * 0.6;
      }
      const bubbleGeometry = new THREE.BufferGeometry();
      bubbleGeometry.setAttribute("position", new THREE.BufferAttribute(bubblePositions, 3));
      const bubbleMaterial = new THREE.PointsMaterial({
        size: 0.035,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        sizeAttenuation: true,
      });
      const bubbles = new THREE.Points(bubbleGeometry, bubbleMaterial);
      scene.add(bubbles);

      // --- テーマ(ライト/ダーク)の色 ---
      const topColor = new THREE.Color();
      const deepColor = new THREE.Color();
      const background = new THREE.Color();
      let lineStrength = 1;
      const applyTheme = () => {
        const theme = THEME[document.documentElement.dataset.theme === "dark" ? "dark" : "light"];
        lineStrength = theme.lines;
        topColor.set(theme.top);
        deepColor.set(theme.deep);
        waterUniforms.uColor.value.set(theme.water);
        bubbleMaterial.color.set(theme.water);
        const blending = theme.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
        haloMaterial.blending = blending;
        haloMaterial.opacity = theme.additive ? 0.2 : 0.14;
        haloMaterial.needsUpdate = true;
        mirrorMaterial.opacity = theme.additive ? 0.22 : 0.14;
        requestRender();
      };

      // --- 大きさ・スクロール ---
      let progress = 0; // ページ全体のスクロール量 0..1
      let shown = 0; // 画面に反映済みの値(なめらかに追従させる)
      const readScroll = () => {
        const range = document.documentElement.scrollHeight - window.innerHeight;
        progress = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0;
        requestRender();
      };
      const resize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.fov = width < 640 ? 62 : 48; // 縦長の画面では広めに写す
        camera.updateProjectionMatrix();
        readScroll();
      };

      const dummy = new THREE.Object3D();
      const lookTarget = new THREE.Vector3();
      const draw = (time: number) => {
        // カメラ: 水面の上(1.5) → 水面(0) → 深い所(-9.5)
        const depth = smooth(0.02, 0.95, shown);
        camera.position.set(Math.sin(shown * 2.2) * 0.9, 1.5 - depth * 11, 6.5 - depth * 2.5);
        lookTarget.set(0, camera.position.y * 0.55 + 2.6 + depth * 0.6, -7);
        camera.lookAt(lookTarget);

        const under = smooth(0.0, -1.2, camera.position.y);
        background.copy(topColor).lerp(deepColor, smooth(0.5, -9, camera.position.y));
        scene.background = background;
        fog.color.copy(background);
        fog.density = 0.034 + under * 0.05;
        waterUniforms.uTime.value = time;
        waterUniforms.uOpacity.value = (1 - under * 0.35) * lineStrength;

        for (let i = 0; i < total; i++) {
          const item = sticks[i];
          if (i < CROWD) {
            const sway = Math.sin(time * item.speed + item.phase) * item.tilt;
            dummy.position.set(item.x, item.y, item.z);
            dummy.rotation.set(0, 0, sway);
            dummy.updateMatrix();
            cores.setMatrixAt(i, dummy.matrix);
            halos.setMatrixAt(i, dummy.matrix);
            // 水面への映り込み(上下反転)
            dummy.position.y = -item.y;
            dummy.rotation.z = -sway;
            dummy.updateMatrix();
            mirrors.setMatrixAt(i, dummy.matrix);
          } else {
            dummy.position.set(item.x, item.y + Math.sin(time * item.speed + item.phase) * 0.25, item.z);
            dummy.rotation.set(item.tilt + time * item.spin, item.phase, item.tilt * 0.6 + time * item.spin * 0.7);
            dummy.updateMatrix();
            cores.setMatrixAt(i, dummy.matrix);
            halos.setMatrixAt(i, dummy.matrix);
          }
        }
        cores.instanceMatrix.needsUpdate = true;
        halos.instanceMatrix.needsUpdate = true;
        mirrors.instanceMatrix.needsUpdate = true;

        const positions = bubbleGeometry.attributes.position as import("three").BufferAttribute;
        for (let i = 0; i < BUBBLES; i++) {
          let y = positions.getY(i) + bubbleSpeeds[i] * 0.012;
          if (y > -0.1) y = -13;
          positions.setY(i, y);
        }
        positions.needsUpdate = !reduceMotion;

        renderer.render(scene, camera);
      };

      // --- 描画ループ。動きを減らす設定のときは、必要なときだけ1枚描く ---
      let frame = 0;
      let running = false;
      const clock = new THREE.Clock();
      const loop = () => {
        shown += (progress - shown) * 0.08;
        draw(clock.getElapsedTime());
        frame = requestAnimationFrame(loop);
      };
      const start = () => {
        if (running || reduceMotion || document.hidden) return;
        running = true;
        frame = requestAnimationFrame(loop);
      };
      const stop = () => {
        running = false;
        cancelAnimationFrame(frame);
      };
      function requestRender() {
        if (!reduceMotion) return;
        shown = 0; // 動きを減らす設定では潜らず、水面の静止画のままにする
        draw(0);
      }
      const onVisibility = () => (document.hidden ? stop() : start());

      applyTheme();
      resize();
      draw(0);
      start();
      setReady(true);

      window.addEventListener("resize", resize);
      window.addEventListener("scroll", readScroll, { passive: true });
      window.addEventListener("themechange", applyTheme);
      document.addEventListener("visibilitychange", onVisibility);

      cleanup = () => {
        stop();
        window.removeEventListener("resize", resize);
        window.removeEventListener("scroll", readScroll);
        window.removeEventListener("themechange", applyTheme);
        document.removeEventListener("visibilitychange", onVisibility);
        for (const geometry of [stick, halo, water.geometry, bubbleGeometry]) geometry.dispose();
        for (const material of [coreMaterial, haloMaterial, mirrorMaterial, bubbleMaterial]) material.dispose();
        (water.material as import("three").Material).dispose();
        renderer.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={`pointer-events-none fixed inset-0 -z-10 h-full w-full transition-opacity duration-700 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
      />
      {ready ? null : children}
    </>
  );
}
