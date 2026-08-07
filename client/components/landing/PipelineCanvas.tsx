'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/components/layout/I18nProvider';

/**
 * The pipeline, drawn: how a player actually reaches an academy.
 *
 * ## Why a canvas and not a diagram image
 *
 * The thing a first-time visitor cannot work out from any amount of prose is
 * *the order* — that a scout's recommendation does not get anybody in, that a
 * coach reads the profile before anybody is invited, and that the only step
 * which reaches a squad is somebody standing on a pitch. Motion carries order
 * for free: a ball travels the path and stops at each stage in turn.
 *
 * A canvas rather than an SVG animation because the whole scene is one element
 * with one repaint, which is cheaper than animating a dozen DOM nodes on the
 * entry-level Android phone §14 targets — and far cheaper than shipping a video.
 *
 * ## Why it stops rather than glides
 *
 * The first version moved at a constant speed, and a constant speed says every
 * step is the same size. They are not: the ball resting on a node while its card
 * lights up is what makes a reader connect the dot to the sentence. So the
 * timeline is travel-then-dwell, four times, and the dwell is the longer half.
 *
 * ## The dashed arc underneath is the rule people get wrong
 *
 * A global trial needs no online review (TRIAL.md Rule 5), and nothing in a
 * left-to-right row of five can say so. The bypass curve is drawn permanently,
 * with a slow marching dash so it reads as a live alternative route rather than
 * a decoration, and the legend under the canvas names it in words.
 *
 * ## What it will not do
 *
 * - **No animation for anyone who asked for none.** `prefers-reduced-motion`
 *   draws the finished diagram once, statically, and stops.
 * - **No work while off-screen.** An IntersectionObserver stops the loop when
 *   the section scrolls away, so a landing page left open in a tab is not
 *   quietly spending somebody's battery.
 * - **No re-render per frame.** The canvas paints itself at 60fps; React only
 *   hears about it when the *stage* changes, which is five times a cycle.
 * - **No text baked into pixels.** Labels are real DOM beneath the canvas, so
 *   they translate with the rest of the page (§14) and a screen reader reads the
 *   stages in order. The canvas itself is `aria-hidden`, and each label is a
 *   button that seeks the animation to its stage.
 */

/** One stage of the pipeline. `optional` is the online review, skipped by a global trial. */
interface Stage {
  key: 'discovered' | 'recommended' | 'review' | 'trial' | 'squad';
  optional?: boolean;
}

const STAGES: Stage[] = [
  { key: 'discovered' },
  { key: 'recommended' },
  { key: 'review', optional: true },
  { key: 'trial' },
  { key: 'squad' },
];

/** Where the bypass leaves the track and where it rejoins it — Rule 5. */
const BYPASS_FROM = 0;
const BYPASS_TO = 3;

const TRAVEL = 1300;
const DWELL = 900;
/** A beat on the last node, so the cycle does not snap back the instant it lands. */
const TAIL = 1200;
const CYCLE = DWELL + (STAGES.length - 1) * (TRAVEL + DWELL) + TAIL;

/** Where in the cycle stage `index` is settled on — what a label click seeks to. */
function offsetOf(index: number) {
  return index === 0 ? 0 : DWELL + (index - 1) * (TRAVEL + DWELL) + TRAVEL;
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function PipelineCanvas() {
  const { t } = useI18n();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const seekRef = React.useRef<(index: number) => void>(() => {});
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /*
     * Colours come from the page's own CSS variables rather than a second
     * hardcoded palette, so the drawing follows the theme — including the
     * light/dark switch — with nothing to keep in step. They are oklch strings;
     * translucency is done with `globalAlpha` rather than by editing them,
     * because there is no safe way to splice an alpha into an arbitrary colour
     * function.
     */
    const read = (name: string, fallback: string) =>
      getComputedStyle(wrap).getPropertyValue(name).trim() || fallback;

    const readPalette = () => ({
      line: read('--color-border', '#d4d4d8'),
      dim: read('--color-muted', '#71717a'),
      primary: read('--color-primary', '#16a34a'),
      strong: read('--color-primary-strong', '#15803d'),
      onPrimary: read('--color-primary-foreground', '#ffffff'),
      surface: read('--color-surface', '#ffffff'),
    });

    let palette = readPalette();
    let width = 0;
    let height = 0;
    /** Node radius and horizontal padding both shrink on a narrow screen. */
    let unit = 9;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      unit = width < 520 ? 7 : 9;
      palette = readPalette();
    };

    /**
     * The track sits above centre, leaving the lower third for the bypass arc.
     * `at` is in node units (0…4), so a position between stages is just a
     * fractional index.
     */
    const pointAt = (at: number) => {
      const pad = unit * 3;
      const span = Math.max(1, width - pad * 2);
      return {
        x: pad + (span * at) / (STAGES.length - 1),
        y: height * 0.38,
      };
    };

    /** Travel-then-dwell, four times over. Returns a fractional node index. */
    const positionAt = (elapsed: number) => {
      if (elapsed < DWELL) return 0;
      let cursor = DWELL;
      for (let i = 0; i < STAGES.length - 1; i += 1) {
        if (elapsed < cursor + TRAVEL) return i + easeInOut((elapsed - cursor) / TRAVEL);
        cursor += TRAVEL;
        if (elapsed < cursor + DWELL) return i + 1;
        cursor += DWELL;
      }
      return STAGES.length - 1;
    };

    /**
     * The route a player takes to an open trial: no recommendation, no online
     * review, straight to the pitch. Drawn under the track as a curve, because a
     * second straight line would read as a second pipeline.
     */
    const drawBypass = (dashOffset: number) => {
      const from = pointAt(BYPASS_FROM);
      const to = pointAt(BYPASS_TO);
      const dip = Math.min(height * 0.42, (to.x - from.x) * 0.22);

      context.save();
      context.globalAlpha = 0.55;
      context.strokeStyle = palette.dim;
      context.lineWidth = 1.5;
      context.setLineDash([5, 6]);
      context.lineDashOffset = -dashOffset;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.bezierCurveTo(
        from.x + (to.x - from.x) * 0.28,
        from.y + dip,
        to.x - (to.x - from.x) * 0.28,
        to.y + dip,
        to.x,
        to.y,
      );
      context.stroke();
      context.restore();
    };

    /** A football, rolling: the specks turn with the distance travelled. */
    const drawBall = (x: number, y: number, rotation: number) => {
      const r = unit * 0.85;

      context.save();
      // A soft pool of light under the ball, so the eye is pulled to it before
      // it is pulled to the line.
      const glow = context.createRadialGradient(x, y, 0, x, y, r * 3.4);
      glow.addColorStop(0, palette.primary);
      glow.addColorStop(1, 'transparent');
      context.globalAlpha = 0.22;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, r * 3.4, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.save();
      context.translate(x, y);
      context.rotate(rotation);

      context.beginPath();
      context.arc(0, 0, r, 0, Math.PI * 2);
      context.fillStyle = palette.onPrimary;
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = palette.strong;
      context.stroke();

      context.fillStyle = palette.strong;
      context.beginPath();
      context.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      context.fill();
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        context.beginPath();
        context.arc(
          Math.cos(angle) * r * 0.62,
          Math.sin(angle) * r * 0.62,
          r * 0.17,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      context.restore();
    };

    const draw = (elapsed: number) => {
      const at = reduced ? STAGES.length - 1 : positionAt(elapsed % CYCLE);
      const head = pointAt(at);
      const start = pointAt(0);
      const end = pointAt(STAGES.length - 1);

      context.clearRect(0, 0, width, height);

      drawBypass(reduced ? 0 : (elapsed / 46) % 11);

      // The whole track, then the travelled part painted over it.
      context.lineCap = 'round';
      context.lineWidth = 3;
      context.strokeStyle = palette.line;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();

      context.save();
      context.globalAlpha = 0.18;
      context.lineWidth = 9;
      context.strokeStyle = palette.primary;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(head.x, head.y);
      context.stroke();
      context.restore();

      context.lineWidth = 3;
      context.strokeStyle = palette.primary;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(head.x, head.y);
      context.stroke();

      const settled = Math.round(at);
      const isSettled = Math.abs(at - settled) < 0.02;

      STAGES.forEach((stage, index) => {
        const node = pointAt(index);
        const reached = at >= index - 0.02;
        const current = isSettled && settled === index;

        // A halo that breathes on the stage the ball is resting on. It is the
        // only thing tying the drawing to the card that lights up below it.
        if (current && !reduced) {
          const beat = (Math.sin(elapsed / 320) + 1) / 2;
          context.save();
          context.globalAlpha = 0.1 + beat * 0.16;
          context.fillStyle = palette.primary;
          context.beginPath();
          context.arc(node.x, node.y, unit * (1.9 + beat * 0.5), 0, Math.PI * 2);
          context.fill();
          context.restore();
        }

        context.beginPath();
        context.arc(node.x, node.y, current ? unit * 1.15 : unit, 0, Math.PI * 2);
        context.fillStyle = reached ? palette.primary : palette.surface;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = reached ? palette.primary : palette.line;
        // Dashed while it is still ahead: a global trial may never call at this
        // stop at all, and a solid ring would promise that everybody does.
        if (stage.optional && !reached) context.setLineDash([3, 3]);
        context.stroke();
        context.setLineDash([]);

        // A tick inside the ones already answered.
        if (reached && !current) {
          context.save();
          context.strokeStyle = palette.onPrimary;
          context.lineWidth = 2;
          context.lineCap = 'round';
          context.beginPath();
          context.moveTo(node.x - unit * 0.42, node.y);
          context.lineTo(node.x - unit * 0.1, node.y + unit * 0.34);
          context.lineTo(node.x + unit * 0.45, node.y - unit * 0.38);
          context.stroke();
          context.restore();
        }
      });

      if (!reduced) drawBall(head.x, head.y, (head.x - start.x) / (unit * 0.85));

      return settled;
    };

    let frame = 0;
    let began = 0;
    let running = false;
    let lastStage = -1;

    const paint = (elapsed: number) => {
      const stage = draw(elapsed);
      // React hears about the stage, not about the frame. Without this the page
      // re-rendered sixty times a second to set a number it already had.
      if (stage !== lastStage) {
        lastStage = stage;
        setActive(stage);
      }
    };

    const tick = (now: number) => {
      if (!began) began = now;
      paint(now - began);
      if (running && !reduced) frame = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (running || reduced) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };

    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    resize();
    paint(reduced ? CYCLE : 0);

    seekRef.current = (index: number) => {
      if (reduced) return;
      began = performance.now() - offsetOf(index);
      paint(offsetOf(index));
    };

    // Nothing runs while the section is off-screen.
    const seen = new IntersectionObserver(
      ([entry]) => (entry?.isIntersecting ? startLoop() : stopLoop()),
      { threshold: 0.15 },
    );
    seen.observe(wrap);

    const onResize = () => {
      resize();
      paint(reduced ? CYCLE : performance.now() - began);
    };
    window.addEventListener('resize', onResize);

    return () => {
      stopLoop();
      seen.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div
        ref={wrapRef}
        className="border-border bg-surface-2/40 relative h-28 w-full overflow-hidden rounded-xl border sm:h-32"
      >
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0" />
      </div>

      {/* The dashed route needs words. A crawler, a screen reader and anybody who
          has never seen a trial all read this rather than the curve. */}
      <p className="text-muted flex items-center gap-2 text-xs">
        <span
          aria-hidden
          className="border-muted/70 inline-block h-0 w-8 shrink-0 border-t border-dashed"
        />
        {t.landing.pipelineBypass}
      </p>

      {/*
       * The labels are the content; the canvas above is the emphasis. An ordered
       * list, so a screen reader reads the pipeline in the order it happens and
       * the stages translate with everything else. Each one is a button, because
       * somebody who wants to reread step three should not have to wait for the
       * ball to come round again.
       */}
      <ol className="grid gap-3 sm:grid-cols-5">
        {STAGES.map((stage, index) => {
          const done = index < active;
          const current = index === active;
          return (
            <li key={stage.key}>
              <button
                type="button"
                onClick={() => seekRef.current(index)}
                aria-current={current ? 'step' : undefined}
                className={[
                  'h-full w-full rounded-lg border p-3 text-left transition-colors',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                  current
                    ? 'border-primary bg-primary/[0.06] shadow-sm'
                    : done
                      ? 'border-primary/30 bg-primary/[0.02]'
                      : 'border-border hover:border-primary/40',
                ].join(' ')}
              >
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <span
                    aria-hidden
                    className={[
                      'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                      current || done
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface-2 text-muted',
                    ].join(' ')}
                  >
                    {done ? <Check className="size-3" /> : index + 1}
                  </span>
                  {t.landing.pipeline[stage.key].title}
                </p>
                <p className="text-muted mt-1 text-xs">{t.landing.pipeline[stage.key].body}</p>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
