import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { gsap, Flip } from '../../../lib/gsap';

// Dev-only frame-time probe (stripped in production builds)
export function probe<T extends gsap.core.Timeline | gsap.core.Tween>(_label: string, tl: T): T {
  return tl;
}

// Track the last clicked trigger element for PanelMorph origin and focus return
let lastTriggerEl: HTMLElement | null = null;

export const setLastTriggerElement = (el: HTMLElement | null) => {
  lastTriggerEl = el;
};

export const getLastTriggerElement = (): HTMLElement | null => lastTriggerEl;

// Deterministic scroll-lock manager so body overflow never gets stuck during GSAP close animations
const activeModalIds = new Set<symbol>();

export const lockBodyScroll = (id: symbol) => {
  activeModalIds.add(id);
  if (typeof document !== 'undefined') {
    document.body.style.overflow = 'hidden';
  }
};

export const unlockBodyScroll = (id: symbol) => {
  activeModalIds.delete(id);
  if (typeof document !== 'undefined' && activeModalIds.size === 0) {
    document.body.style.overflow = '';
  }
};

export const resetBodyScrollIfIdle = () => {
  if (typeof document !== 'undefined' && activeModalIds.size === 0) {
    document.body.style.overflow = '';
  }
};

// 1. Continuous Island Movement (WeakMap edges, translate3d + width, lead 0.38s, trail 0.46s delay 0.05s)
const edges = new WeakMap<HTMLElement, { l: number; r: number }>();

export function snapIsland(island: HTMLElement, target: HTMLElement, parent: HTMLElement) {
  const p = parent.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  if (p.width === 0 || t.width === 0) return;
  const nl = t.left - p.left;
  const nr = t.right - p.left;
  const e = edges.get(island) ?? { l: nl, r: nr };
  e.l = nl;
  e.r = nr;
  edges.set(island, e);
  gsap.killTweensOf(e);
  island.style.transform = `translate3d(${e.l}px,0,0)`;
  island.style.width = `${Math.max(0, e.r - e.l)}px`;
  island.style.opacity = '1';
  island.style.willChange = 'auto';
}

export function moveIsland(island: HTMLElement, target: HTMLElement, parent: HTMLElement) {
  const p = parent.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  if (p.width === 0 || t.width === 0) return null;
  const nl = t.left - p.left;
  const nr = t.right - p.left;
  const e = edges.get(island) ?? { l: nl, r: nr };
  edges.set(island, e);
  const right = nl >= e.l;
  gsap.killTweensOf(e);
  const render = () => {
    island.style.transform = `translate3d(${e.l}px,0,0)`;
    island.style.width = `${Math.max(0, e.r - e.l)}px`;
  };
  island.style.opacity = '1';
  island.style.willChange = 'transform';
  const tl = gsap.timeline({
    onUpdate: render,
    onComplete: () => {
      island.style.willChange = 'auto';
    },
  });
  tl.to(e, { [right ? 'r' : 'l']: right ? nr : nl, duration: 0.38, ease: 'power3.out' }, 0).to(
    e,
    { [right ? 'l' : 'r']: right ? nl : nr, duration: 0.46, ease: 'power3.out' },
    0.05
  );
  return probe('moveIsland', tl);
}

export function useIsland<T extends string>(activeKey: T) {
  const containerRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<T, HTMLElement>>(new Map());
  const prevKeyRef = useRef<T | null>(null);
  const fontsReadyRef = useRef(false);

  const registerItem = useCallback(
    (key: T) => (el: HTMLElement | null) => {
      if (el) {
        itemRefs.current.set(key, el);
      } else {
        itemRefs.current.delete(key);
      }
    },
    []
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const island = islandRef.current;
    const target = itemRefs.current.get(activeKey);
    if (!container || !island || !target) return;

    const isFirst = prevKeyRef.current === null || prevKeyRef.current === activeKey;
    prevKeyRef.current = activeKey;

    let cancelled = false;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (isFirst || prefersReduced) {
      snapIsland(island, target, container);
      if (!fontsReadyRef.current && typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          if (cancelled) return;
          fontsReadyRef.current = true;
          const curContainer = containerRef.current;
          const curIsland = islandRef.current;
          const curTarget = itemRefs.current.get(activeKey);
          if (curContainer && curIsland && curTarget) {
            snapIsland(curIsland, curTarget, curContainer);
          }
        });
      }
    } else {
      moveIsland(island, target, container);
    }

    return () => {
      cancelled = true;
    };
  }, [activeKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const curContainer = containerRef.current;
      const curIsland = islandRef.current;
      const curTarget = prevKeyRef.current ? itemRefs.current.get(prevKeyRef.current) : null;
      if (curContainer && curIsland && curTarget) {
        snapIsland(curIsland, curTarget, curContainer);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return { containerRef, islandRef, registerItem };
}

// NavIsland: 3px #FFBD59 bar under active top nav item, animated with moveIsland
export const NavIsland: React.FC<{
  containerRef: React.RefObject<HTMLElement | null>;
  activeKey: string;
}> = ({ containerRef, activeKey }) => {
  const islandRef = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef<string | null>(null);
  const fontsReadyRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const island = islandRef.current;
    if (!container || !island) return;
    const target = container.querySelector<HTMLElement>(
      `[data-island-key="${CSS.escape(activeKey)}"]`
    );
    if (!target) return;

    const isFirst = prevKeyRef.current === null || prevKeyRef.current === activeKey;
    prevKeyRef.current = activeKey;

    let cancelled = false;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (isFirst || prefersReduced) {
      snapIsland(island, target, container);
      if (!fontsReadyRef.current && typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          if (cancelled) return;
          fontsReadyRef.current = true;
          const curContainer = containerRef.current;
          const curIsland = islandRef.current;
          const curTarget = curContainer?.querySelector<HTMLElement>(
            `[data-island-key="${CSS.escape(activeKey)}"]`
          );
          if (curContainer && curIsland && curTarget) {
            snapIsland(curIsland, curTarget, curContainer);
          }
        });
      }
    } else {
      moveIsland(island, target, container);
    }

    return () => {
      cancelled = true;
    };
  }, [activeKey, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const curContainer = containerRef.current;
      const curIsland = islandRef.current;
      const curKey = prevKeyRef.current;
      if (!curContainer || !curIsland || !curKey) return;
      const curTarget = curContainer.querySelector<HTMLElement>(
        `[data-island-key="${CSS.escape(curKey)}"]`
      );
      if (curTarget) {
        snapIsland(curIsland, curTarget, curContainer);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef]);

  return (
    <div
      ref={islandRef}
      aria-hidden="true"
      style={{ width: 0, opacity: 0, left: 0 }}
      className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-[#FFBD59] z-0"
    />
  );
};

// TabIsland: #1E2230 pill behind active tab button, animated with moveIsland
export const TabIsland: React.FC<{
  containerRef: React.RefObject<HTMLElement | null>;
  activeKey: string;
}> = ({ containerRef, activeKey }) => {
  const islandRef = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef<string | null>(null);
  const fontsReadyRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const island = islandRef.current;
    if (!container || !island) return;
    const target = container.querySelector<HTMLElement>(
      `[data-island-key="${CSS.escape(activeKey)}"]`
    );
    if (!target) return;

    const isFirst = prevKeyRef.current === null || prevKeyRef.current === activeKey;
    prevKeyRef.current = activeKey;

    let cancelled = false;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (isFirst || prefersReduced) {
      snapIsland(island, target, container);
      if (!fontsReadyRef.current && typeof document !== 'undefined' && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          if (cancelled) return;
          fontsReadyRef.current = true;
          const curContainer = containerRef.current;
          const curIsland = islandRef.current;
          const curTarget = curContainer?.querySelector<HTMLElement>(
            `[data-island-key="${CSS.escape(activeKey)}"]`
          );
          if (curContainer && curIsland && curTarget) {
            snapIsland(curIsland, curTarget, curContainer);
          }
        });
      }
    } else {
      moveIsland(island, target, container);
    }

    return () => {
      cancelled = true;
    };
  }, [activeKey, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const curContainer = containerRef.current;
      const curIsland = islandRef.current;
      const curKey = prevKeyRef.current;
      if (!curContainer || !curIsland || !curKey) return;
      const curTarget = curContainer.querySelector<HTMLElement>(
        `[data-island-key="${CSS.escape(curKey)}"]`
      );
      if (curTarget) {
        snapIsland(curIsland, curTarget, curContainer);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef]);

  return (
    <div
      ref={islandRef}
      aria-hidden="true"
      style={{ width: 0, opacity: 0, left: 0 }}
      className="pointer-events-none absolute top-0 bottom-0 h-10 my-auto rounded-[12px] bg-[#1E2230] z-0"
    />
  );
};

// Row removal helper: opacity + y first (0.18s power3.in), then Flip.from on remaining rows (transforms only)
export function animateRowRemoval(
  rowEl: HTMLElement | null,
  tableContainer: HTMLElement | null,
  onRemoveState: () => void
) {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!rowEl || prefersReduced) {
    onRemoveState();
    return;
  }

  gsap.killTweensOf(rowEl);
  rowEl.style.willChange = 'transform, opacity';

  const outTween = gsap.to(rowEl, {
    opacity: 0,
    y: -6,
    duration: 0.18,
    ease: 'power3.in',
    onComplete: () => {
      rowEl.style.willChange = 'auto';
      const remainingRows = tableContainer
        ? Array.from(tableContainer.querySelectorAll<HTMLElement>('tbody tr.row')).filter(
            (r) => r !== rowEl
          )
        : [];
      const flipState = remainingRows.length > 0 ? Flip.getState(remainingRows) : null;

      flushSync(() => {
        onRemoveState();
      });

      if (flipState && remainingRows.length > 0) {
        remainingRows.forEach((r) => {
          r.style.willChange = 'transform';
        });
        const flipTl = Flip.from(flipState, {
          duration: 0.28,
          ease: 'power3.out',
          simple: true,
          onComplete: () => {
            remainingRows.forEach((r) => {
              r.style.willChange = 'auto';
            });
          },
        });
        probe('RowRemovalFlip', flipTl);
      }
    },
  });
  probe('RowRemovalOut', outTween);
}

// 2. RouteTransition: exit 0.12s (opacity only, power3.in), enter 0.32s (y: 12 -> 0, opacity: 0 -> 1, power3.out, max 8 items stagger 0.03s)
export const RouteTransition: React.FC<{ routeKey: string; children: React.ReactNode }> = ({
  routeKey,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef<string | null>(null);
  const prevHtmlRef = useRef<string>('');
  const activeTlRef = useRef<gsap.core.Timeline | null>(null);
  const ghostOverlayRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Fast input: kill old timeline and remove any lingering ghost overlay
    if (activeTlRef.current) {
      activeTlRef.current.kill();
      activeTlRef.current = null;
    }
    if (ghostOverlayRef.current) {
      ghostOverlayRef.current.remove();
      ghostOverlayRef.current = null;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const isRouteSwitch = prevKeyRef.current !== null && prevKeyRef.current !== routeKey;
    prevKeyRef.current = routeKey;

    const rawBlocks = Array.from(
      el.querySelectorAll<HTMLElement>(
        ':scope > div > *, .page-header, .kpi-card, .admin-card, tbody tr.row'
      )
    );
    const targets = rawBlocks.length > 0 ? rawBlocks : [el];
    const staggered = targets.slice(0, 8);
    const rest = targets.slice(8);

    if (prefersReduced) {
      gsap.set(targets, { clearProps: 'opacity,transform,willChange' });
      prevHtmlRef.current = el.innerHTML;
      return;
    }

    // Set start state before paint so new view never flashes at full opacity
    if (rest.length > 0) {
      gsap.set(rest, { opacity: 1, y: 0, clearProps: 'willChange' });
    }
    gsap.set(staggered, { opacity: 0, y: 12, willChange: 'transform, opacity' });

    const tl = gsap.timeline({
      onComplete: () => {
        if (ghostOverlayRef.current) {
          ghostOverlayRef.current.remove();
          ghostOverlayRef.current = null;
        }
        gsap.set(staggered, { clearProps: 'willChange,transform,opacity' });
        prevHtmlRef.current = el.innerHTML;
        activeTlRef.current = null;
      },
    });
    activeTlRef.current = tl;

    let enterStart = 0;
    if (isRouteSwitch && prevHtmlRef.current) {
      const ghost = document.createElement('div');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.position = 'absolute';
      ghost.style.inset = '0';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '5';
      ghost.style.willChange = 'opacity';
      ghost.innerHTML = prevHtmlRef.current;
      el.appendChild(ghost);
      ghostOverlayRef.current = ghost;

      tl.to(
        ghost,
        {
          opacity: 0,
          duration: 0.12,
          ease: 'power3.in',
          onComplete: () => {
            if (ghostOverlayRef.current === ghost) {
              ghost.remove();
              ghostOverlayRef.current = null;
            }
          },
        },
        0
      );
      enterStart = 0.12;
    }

    tl.to(
      staggered,
      {
        opacity: 1,
        y: 0,
        duration: 0.32,
        stagger: 0.03,
        ease: 'power3.out',
      },
      enterStart
    );

    probe('RouteTransition', tl);

    return () => {
      if (activeTlRef.current) {
        activeTlRef.current.kill();
        activeTlRef.current = null;
      }
      if (ghostOverlayRef.current) {
        ghostOverlayRef.current.remove();
        ghostOverlayRef.current = null;
      }
    };
  }, [routeKey]);

  return (
    <div ref={ref} className="relative">
      {children}
    </div>
  );
};

// 3. ListSwap: out 0.12s (opacity only, power3.in), in 0.28s (y: 12 -> 0, opacity: 0 -> 1, power3.out, stagger 0.03s on max 8 items)
export const ListSwap: React.FC<{
  swapKey: string;
  children: React.ReactNode;
  className?: string;
}> = ({ swapKey, children, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef<string>(swapKey);
  const prevHtmlRef = useRef<string>('');
  const activeTlRef = useRef<gsap.core.Timeline | null>(null);
  const ghostOverlayRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if ( prevKeyRef.current === swapKey ) {
      prevHtmlRef.current = el.innerHTML;
      return;
    }
    prevKeyRef.current = swapKey;

    if (activeTlRef.current) {
      activeTlRef.current.kill();
      activeTlRef.current = null;
    }
    if (ghostOverlayRef.current) {
      ghostOverlayRef.current.remove();
      ghostOverlayRef.current = null;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const rows = Array.from(el.querySelectorAll<HTMLElement>('tbody tr.row, .swap-item'));
    const targets = rows.length > 0 ? rows : [el];
    const staggered = targets.slice(0, 8);
    const rest = targets.slice(8);

    if (prefersReduced) {
      gsap.set(targets, { clearProps: 'opacity,transform,willChange' });
      prevHtmlRef.current = el.innerHTML;
      return;
    }

    if (rest.length > 0) {
      gsap.set(rest, { opacity: 1, y: 0, clearProps: 'willChange' });
    }
    gsap.set(staggered, { opacity: 0, y: 12, willChange: 'transform, opacity' });

    const tl = gsap.timeline({
      onComplete: () => {
        if (ghostOverlayRef.current) {
          ghostOverlayRef.current.remove();
          ghostOverlayRef.current = null;
        }
        gsap.set(staggered, { clearProps: 'willChange,transform,opacity' });
        prevHtmlRef.current = el.innerHTML;
        activeTlRef.current = null;
      },
    });
    activeTlRef.current = tl;

    let enterStart = 0;
    if (prevHtmlRef.current) {
      const ghost = document.createElement('div');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.position = 'absolute';
      ghost.style.inset = '0';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '5';
      ghost.style.backgroundColor = '#FFFFFF';
      ghost.style.willChange = 'opacity';
      ghost.innerHTML = prevHtmlRef.current;
      el.appendChild(ghost);
      ghostOverlayRef.current = ghost;

      tl.to(
        ghost,
        {
          opacity: 0,
          duration: 0.12,
          ease: 'power3.in',
          onComplete: () => {
            if (ghostOverlayRef.current === ghost) {
              ghost.remove();
              ghostOverlayRef.current = null;
            }
          },
        },
        0
      );
      enterStart = 0.12;
    }

    tl.to(
      staggered,
      {
        opacity: 1,
        y: 0,
        duration: 0.28,
        stagger: 0.03,
        ease: 'power3.out',
      },
      enterStart
    );

    probe('ListSwap', tl);

    return () => {
      if (activeTlRef.current) {
        activeTlRef.current.kill();
        activeTlRef.current = null;
      }
      if (ghostOverlayRef.current) {
        ghostOverlayRef.current.remove();
        ghostOverlayRef.current = null;
      }
    };
  }, [swapKey]);

  return (
    <div ref={ref} className={`relative ${className}`.trim()}>
      {children}
    </div>
  );
};

// 4. PanelMorph: Ghost rounded rectangle animated with Flip.fit (transforms only, 0.42s, power3.out).
// At 55% (0.231s), panel fades in (opacity 0 -> 1) and moves x: 16 -> 0 over 0.25s while ghost fades out over 0.15s.
// Closing reverses in 0.3s with power3.in.
export const PanelMorph: React.FC<{
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  onExited?: () => void;
}> = ({ isOpen, children, className = '', onExited }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = getLastTriggerElement() || (document.activeElement as HTMLElement);
      setMounted(true);
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const p = panelRef.current;
    const ghost = ghostRef.current;
    if (!p || !ghost) return;

    const restoreTriggerFocus = () => {
      const trig = triggerRef.current;
      if (trig && document.body.contains(trig)) {
        trig.focus();
      }
    };

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    gsap.killTweensOf([p, ghost]);

    if (prefersReduced) {
      if (isOpen) {
        gsap.set(ghost, { opacity: 0 });
        gsap.set(p, { opacity: 1, x: 0, clearProps: 'willChange,transform' });
      } else {
        setMounted(false);
        restoreTriggerFocus();
        onExited?.();
      }
      return;
    }

    const trig = triggerRef.current;
    const hasTrig = Boolean(trig && document.body.contains(trig));

    if (isOpen) {
      // Read first
      const pRect = p.getBoundingClientRect();
      const tRect = hasTrig && trig ? trig.getBoundingClientRect() : null;
      const validTrig = Boolean(
        tRect && tRect.width > 0 && tRect.height > 0 && pRect.width > 0 && pRect.height > 0
      );

      // Write next
      gsap.set(p, { opacity: 0, x: 16, willChange: 'transform, opacity' });
      gsap.set(ghost, {
        opacity: 1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        willChange: 'transform, opacity',
      });

      if (validTrig && trig) {
        Flip.fit(ghost, trig, { scale: true });
      } else {
        gsap.set(ghost, { scaleX: 0.92, scaleY: 0.92, x: 16 });
      }

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.set(ghost, { opacity: 0, clearProps: 'willChange,transform' });
          gsap.set(p, { clearProps: 'willChange,transform,opacity' });
        },
      });

      tl.to(
        ghost,
        {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          duration: 0.42,
          ease: 'power3.out',
        },
        0
      )
        .to(
          p,
          {
            opacity: 1,
            x: 0,
            duration: 0.25,
            ease: 'power3.out',
          },
          0.231
        )
        .to(
          ghost,
          {
            opacity: 0,
            duration: 0.15,
            ease: 'power2.out',
          },
          0.231
        );

      probe('PanelMorphOpen', tl);
    } else {
      const pRect = p.getBoundingClientRect();
      const tRect = hasTrig && trig ? trig.getBoundingClientRect() : null;
      const validTrig = Boolean(
        tRect && tRect.width > 0 && tRect.height > 0 && pRect.width > 0 && pRect.height > 0
      );

      gsap.set(p, { willChange: 'transform, opacity' });
      gsap.set(ghost, {
        opacity: 1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        willChange: 'transform, opacity',
      });

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.set([p, ghost], { clearProps: 'willChange,transform,opacity' });
          setMounted(false);
          restoreTriggerFocus();
          onExited?.();
        },
      });

      tl.to(
        p,
        {
          opacity: 0,
          x: 16,
          duration: 0.18,
          ease: 'power3.in',
        },
        0
      );

      if (validTrig && trig) {
        const fitVars = Flip.fit(ghost, trig, {
          scale: true,
          getVars: true,
          duration: 0.3,
          ease: 'power3.in',
        }) as gsap.TweenVars;
        tl.to(ghost, { ...fitVars, opacity: 0 }, 0);
      } else {
        tl.to(
          ghost,
          {
            opacity: 0,
            scaleX: 0.92,
            scaleY: 0.92,
            x: 16,
            duration: 0.3,
            ease: 'power3.in',
          },
          0
        );
      }

      probe('PanelMorphClose', tl);
    }
  }, [isOpen, mounted, onExited]);

  if (!mounted) return null;

  return (
    <div className="relative">
      <div
        ref={ghostRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[20px] bg-white z-10"
        style={{ opacity: 0, transformOrigin: 'top left' }}
      />
      <div ref={panelRef} className={className}>
        {children}
      </div>
    </div>
  );
};

// 5. RollingNumber: Tween a plain object { v } and write textContent in onUpdate
export const RollingNumber: React.FC<{
  value: number;
  format?: (val: number) => string;
  prefix?: string;
  suffix?: string;
  className?: string;
}> = ({ value, format, prefix = '', suffix = '', className = '' }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<{ v: number }>({ v: value });
  const mountedRef = useRef(false);

  const fmt = useCallback(
    (n: number) => {
      const rounded = Math.round(n);
      if (format) return format(rounded);
      return `${prefix}${rounded.toLocaleString('id-ID')}${suffix}`;
    },
    [format, prefix, suffix]
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!mountedRef.current || prefersReduced) {
      mountedRef.current = true;
      stateRef.current.v = value;
      el.textContent = fmt(value);
      return;
    }

    gsap.killTweensOf(stateRef.current);
    const tween = gsap.to(stateRef.current, {
      v: value,
      duration: 0.45,
      ease: 'power2.out',
      onUpdate: () => {
        if (ref.current) {
          ref.current.textContent = fmt(stateRef.current.v);
        }
      },
    });
    probe('RollingNumber', tween);
  }, [value, fmt]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {fmt(value)}
    </span>
  );
};

// 6. ActionIsland: Bottom-center confirmation pill (#1E2230, white text, radius 999)
export interface ActionToastItem {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ActionIslandContextValue {
  notify: (
    message: string,
    options?: { actionLabel?: string; onAction?: () => void; durationMs?: number }
  ) => void;
  notifyAction: (opts: {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
  }) => void;
}

const ActionIslandContext = createContext<ActionIslandContextValue>({
  notify: () => {},
  notifyAction: () => {},
});

export const useActionIsland = () => useContext(ActionIslandContext);

export const ActionIslandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [item, setItem] = useState<ActionToastItem | null>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pill = pillRef.current;
    if (!pill) {
      setItem(null);
      return;
    }
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setItem(null);
      return;
    }
    gsap.killTweensOf(pill);
    pill.style.willChange = 'transform, opacity';
    const tl = gsap.to(pill, {
      y: 16,
      opacity: 0,
      scaleX: 0.85,
      duration: 0.25,
      ease: 'power3.in',
      onComplete: () => {
        pill.style.willChange = 'auto';
        setItem(null);
      },
    });
    probe('ActionIslandClose', tl);
  }, []);

  const notify = useCallback(
    (
      message: string,
      options?: { actionLabel?: string; onAction?: () => void; durationMs?: number }
    ) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      setItem({
        id: `${Date.now()}-${Math.random()}`,
        message,
        actionLabel: options?.actionLabel,
        onAction: options?.onAction,
      });
      timerRef.current = window.setTimeout(() => {
        dismiss();
      }, options?.durationMs ?? 2400);
    },
    [dismiss]
  );

  useLayoutEffect(() => {
    if (!item) return;
    const pill = pillRef.current;
    if (!pill) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      gsap.set(pill, { opacity: 1, y: 0, scaleX: 1 });
      return;
    }

    gsap.killTweensOf(pill);
    pill.style.willChange = 'transform, opacity';
    const tl = gsap.fromTo(
      pill,
      { y: 20, opacity: 0, scaleX: 0.82 },
      {
        y: 0,
        opacity: 1,
        scaleX: 1,
        duration: 0.35,
        ease: 'power3.out',
        onComplete: () => {
          pill.style.willChange = 'auto';
        },
      }
    );
    probe('ActionIslandOpen', tl);
  }, [item]);

  const notifyAction = useCallback(
    (opts: { message: string; actionLabel?: string; onAction?: () => void; durationMs?: number }) => {
      notify(opts.message, {
        actionLabel: opts.actionLabel,
        onAction: opts.onAction,
        durationMs: opts.durationMs,
      });
    },
    [notify]
  );

  return (
    <ActionIslandContext.Provider value={{ notify, notifyAction }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] pointer-events-none flex justify-center"
      >
        {item && (
          <div
            ref={pillRef}
            style={{ boxShadow: '0 10px 30px rgba(0, 0, 0, 0.16)' }}
            className="pointer-events-auto bg-[#1E2230] text-white rounded-full h-11 px-4 flex items-center overflow-hidden"
          >
            <div ref={innerRef} className="flex items-center gap-3 whitespace-nowrap">
              <span className="inline-block w-2 h-2 rounded-full bg-[#5CC46A] shrink-0" />
              <span className="font-sans font-medium text-[14px] text-white">{item.message}</span>
              {item.actionLabel && item.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    item.onAction?.();
                    dismiss();
                  }}
                  className="font-sans font-semibold text-[13px] text-white underline underline-offset-2 ml-1"
                >
                  {item.actionLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </ActionIslandContext.Provider>
  );
};
