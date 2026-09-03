// client/src/components/AnimatedCompanion.tsx
//
// Wraps the companion illustration in a lightweight idle animation — no
// extra image assets, no video, no Lottie. Just CSS @keyframes driving
// `transform`, which the browser compositor handles essentially for free
// (no layout/paint cost, unlike animating width/height/top/left).
//
// DinoCompanion.tsx already has its own per-stage blink art (a second PNG
// per stage, swapped in on a timer) and its own breathing animation
// (Tailwind's `animate-dino-breathe`). This component's job is narrower
// than the original sketch: it only adds the SWAY motion, which is new.
// `blinkOverlay` is kept as an opt-in escape hatch (a CSS ellipse over the
// eyes) for a future stage that has no dedicated blink art, but it is not
// wired up anywhere today — the existing image-swap blink is the real one
// and shouldn't be fought with a second, uncoordinated blink effect.

import { useId } from "react";

interface AnimatedCompanionProps {
  src: string;
  alt: string;
  /** className for the outer wrapper (sizing/positioning context). */
  className?: string;
  /** className applied to the actual <img> — sizing, filters, etc. */
  imgClassName?: string;
  testId?: string;
  draggable?: boolean;
  /** Disable animation (e.g. respects a "reduce motion" user setting upstream). */
  animate?: boolean;
  /** Optional click handler — makes the companion image an interactive button (e.g. open Focus). */
  onClick?: () => void;
  title?: string;
  /**
   * Optional eye-blink overlay position, as percentages of the image's
   * bounding box (0-100). Tune these per companion stage by eye — there's
   * no way to derive them from the art file itself. Leave undefined to skip
   * the blink effect entirely (breathing/sway still play).
   */
  blinkOverlay?: { leftPct: number; topPct: number; widthPct: number; heightPct: number };
}

export function AnimatedCompanion({
  src,
  alt,
  className,
  imgClassName,
  testId,
  draggable,
  animate = true,
  blinkOverlay,
  onClick,
  title,
}: AnimatedCompanionProps) {
  // Unique id so multiple AnimatedCompanion instances on one page (unlikely,
  // but e.g. a Settings preview thumbnail alongside the Home hero) don't
  // collide on keyframe/animation names.
  const uid = useId().replace(/[:]/g, "");

  return (
    <div className={className} style={{ position: "relative", lineHeight: 0 }}>
      <style>{`
        @keyframes msb-sway-${uid} {
          0%, 100% { transform: rotate(-1.2deg); }
          50% { transform: rotate(1.2deg); }
        }
        @keyframes msb-blink-${uid} {
          0%, 92%, 100% { opacity: 0; }
          94%, 96% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .msb-anim-${uid} { animation: none !important; }
        }
      `}</style>
      <div
        className={`msb-anim-${uid}`}
        style={{
          animation: animate ? `msb-sway-${uid} 3.4s ease-in-out infinite` : undefined,
          transformOrigin: "center bottom",
        }}
      >
        <img
          src={src}
          alt={alt}
          className={imgClassName}
          style={{ display: "block" }}
          data-testid={testId}
          draggable={draggable}
          onClick={onClick}
          title={title}
          role={onClick ? "button" : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={
            onClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                  }
                }
              : undefined
          }
        />
      </div>
      {animate && blinkOverlay && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${blinkOverlay.leftPct}%`,
            top: `${blinkOverlay.topPct}%`,
            width: `${blinkOverlay.widthPct}%`,
            height: `${blinkOverlay.heightPct}%`,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0,
            animation: `msb-blink-${uid} 4.5s ease-in-out infinite`,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
