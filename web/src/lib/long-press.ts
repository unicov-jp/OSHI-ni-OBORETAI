"use client";

import { useRef, useState } from "react";
import { buzz } from "@/lib/haptic";

// 長押し(0.7秒)を見分ける。押している間は少し縮め、長押しになったら強めに2回振動させて onLongPress を呼ぶ。
// そのあとのクリックは止める
const LONG_PRESS_MS = 700;

export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const [pressing, setPressing] = useState(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  };
  return {
    onPointerDown: (event: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      if (timer.current) clearTimeout(timer.current);
      setPressing(true);
      timer.current = setTimeout(() => {
        fired.current = true;
        setPressing(false);
        buzz([60, 50, 80]);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const s = start.current;
      if (s && Math.hypot(event.clientX - s.x, event.clientY - s.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onClickCapture: (event: React.MouseEvent) => {
      if (fired.current) {
        event.preventDefault();
        event.stopPropagation();
        fired.current = false;
      }
    },
    style: {
      WebkitTouchCallout: "none",
      userSelect: "none",
      transform: pressing ? "scale(0.9)" : undefined,
      transition: `transform ${pressing ? LONG_PRESS_MS : 150}ms ease-out`,
    } as React.CSSProperties,
  };
}

// 推しのアイコン: タップでその推しの新着、長押しでその推しのSNSの登録

// 押している間だけ何かをする(動画の長押しで倍速など)。0.4秒押し続けたら onStart、指を離したら onEnd。
// 押し始めてすぐ指が動いたら(上下のスワイプ)、何もしない。押し続けた後のクリック(タップの動作)は止める
const HOLD_MS = 400;
export function useHold(onStart: () => void, onEnd: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const holding = useRef(false);
  const fired = useRef(false);
  const [active, setActive] = useState(false);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (holding.current) {
      holding.current = false;
      setActive(false);
      onEnd();
    }
  };
  return {
    active,
    handlers: {
      onPointerDown: (event: React.PointerEvent) => {
        fired.current = false;
        start.current = { x: event.clientX, y: event.clientY };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          holding.current = true;
          fired.current = true;
          setActive(true);
          buzz([30]);
          onStart();
        }, HOLD_MS);
      },
      onPointerMove: (event: React.PointerEvent) => {
        const s = start.current;
        if (!holding.current && s && Math.hypot(event.clientX - s.x, event.clientY - s.y) > 10 && timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
      onClickCapture: (event: React.MouseEvent) => {
        if (fired.current) {
          event.preventDefault();
          event.stopPropagation();
          fired.current = false;
        }
      },
    },
  };
}
