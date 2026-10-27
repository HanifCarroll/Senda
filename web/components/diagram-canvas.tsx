import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { safeSvg } from "@/lib/svg";
import type { DiagramView, ModelElement } from "@/lib/types";
import { Alert, AlertTitle, AlertDescription } from "./ui/alert";

export interface CanvasControls {
  zoom: (factor: number) => void;
  fit: () => void;
  actual: () => void;
}
interface Camera {
  x: number;
  y: number;
  scale: number;
  fitted: boolean;
}
interface Props {
  view: DiagramView;
  elements: ModelElement[];
  selected?: string;
  focusRequest: number;
  storageKey: string;
  onSelect: (id: string) => void;
  onZoom: (zoom: number) => void;
  ref: Ref<CanvasControls>;
}

export function DiagramCanvas({
  view,
  elements,
  selected,
  focusRequest,
  storageKey,
  onSelect,
  onZoom,
  ref,
}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const controls = useRef<
    CanvasControls & {
      select?: (id: string | undefined, focus: boolean) => void;
    }
  >(null);
  const saved = useRef(new Map<string, Camera>());
  const consumedFocus = useRef(0);
  const callbacks = useRef({ onSelect, onZoom });
  callbacks.current = { onSelect, onZoom };
  const [error, setError] = useState("");
  useImperativeHandle(
    ref,
    () => ({
      zoom: (n) => controls.current?.zoom(n),
      fit: () => controls.current?.fit(),
      actual: () => controls.current?.actual(),
    }),
    [],
  );

  useEffect(() => {
    const host = stage.current!;
    const abort = new AbortController();
    let observer: ResizeObserver | undefined;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const key = `process-scribe.camera.v1:${storageKey}:${view.elementId}`;
    let flush = () => {};
    try {
      const svg = safeSvg(view.svg);
      host.replaceChildren(svg);
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
      const box = svg.viewBox.baseVal;
      const original = {
        x: box.x,
        y: box.y,
        width: box.width || view.width,
        height: box.height || view.height,
      };
      let stored: Camera | undefined;
      try {
        const candidate = JSON.parse(sessionStorage.getItem(key) || "null");
        if (
          candidate &&
          [candidate.x, candidate.y, candidate.scale].every(Number.isFinite) &&
          candidate.scale >= 0.05 &&
          candidate.scale <= 4
        )
          stored = { ...candidate, fitted: !!candidate.fitted };
      } catch {
        /* Camera persistence is optional. */
      }
      let camera: Camera = saved.current.get(view.elementId) ||
        stored || { ...original, scale: 1, fitted: true };
      flush = () => {
        try {
          sessionStorage.setItem(key, JSON.stringify(camera));
        } catch {
          /* Browser storage is optional. */
        }
      };
      const size = () => ({
        width: host.clientWidth || 1,
        height: host.clientHeight || 1,
      });
      function draw() {
        if (!host.clientWidth || !host.clientHeight) return;
        const { width, height } = size();
        svg.setAttribute(
          "viewBox",
          `${camera.x} ${camera.y} ${width / camera.scale} ${height / camera.scale}`,
        );
        callbacks.current.onZoom(Math.round(camera.scale * 100));
        saved.current.set(view.elementId, { ...camera });
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, 120);
      }
      function fit(initial = false) {
        if (!host.clientWidth || !host.clientHeight) return;
        const { width, height } = size();
        const scale = Math.min(
          1.4,
          width / original.width,
          height / original.height,
        );
        camera =
          initial && scale < 0.65
            ? { x: original.x, y: original.y, scale: 1, fitted: false }
            : {
                scale,
                x: original.x + original.width / 2 - width / scale / 2,
                y: original.y + original.height / 2 - height / scale / 2,
                fitted: true,
              };
        draw();
      }
      function zoomTo(
        scale: number,
        x = host.clientWidth / 2,
        y = host.clientHeight / 2,
      ) {
        scale = Math.min(4, Math.max(0.2, scale));
        camera.x += x / camera.scale - x / scale;
        camera.y += y / camera.scale - y / scale;
        camera.scale = scale;
        camera.fitted = false;
        draw();
      }
      const groups = [...svg.querySelectorAll<SVGGElement>("g[data-id]")];
      const catalog = new Map(elements.map((e) => [e.id, e]));
      const nodes = new Map(groups.map((g) => [g.dataset.id!, g]));
      for (const node of groups) {
        const item = catalog.get(node.dataset.id!);
        if (!item) continue;
        node.setAttribute("tabindex", "0");
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", item.label);
        node.setAttribute("aria-pressed", "false");
        node.classList.add("diagram-element");
        if (item.source && item.target) {
          for (const line of node.querySelectorAll("path,polyline")) {
            const hit = line.cloneNode() as SVGElement;
            hit.removeAttribute("marker-start");
            hit.removeAttribute("marker-end");
            hit.classList.add("connection-hit");
            node.append(hit);
          }
        }
      }
      function select(id: string | undefined, focus: boolean) {
        for (const node of groups) {
          node.classList.toggle("is-selected", node.dataset.id === id);
          node.setAttribute("aria-pressed", String(node.dataset.id === id));
        }
        const node = id ? nodes.get(id) : undefined;
        if (focus && node) {
          const rect = node.getBoundingClientRect(),
            outer = host.getBoundingClientRect(),
            { width, height } = size();
          const x =
            camera.x + (rect.left - outer.left + rect.width / 2) / camera.scale;
          const y =
            camera.y + (rect.top - outer.top + rect.height / 2) / camera.scale;
          const scale = Math.max(
            0.2,
            Math.min(
              1.5,
              width / (rect.width / camera.scale + 100),
              height / (rect.height / camera.scale + 100),
            ),
          );
          camera = {
            scale,
            x: x - width / scale / 2,
            y: y - height / scale / 2,
            fitted: false,
          };
          draw();
          host.focus({ preventScroll: true });
        }
      }
      controls.current = {
        fit: () => fit(),
        zoom: (factor) => zoomTo(camera.scale * factor),
        actual: () => zoomTo(1),
        select,
      };
      if (saved.current.has(view.elementId) || stored) draw();
      else fit(true);
      observer = new ResizeObserver(() => {
        if (host.clientWidth && host.clientHeight)
          camera.fitted ? fit() : draw();
      });
      observer.observe(host);
      let drag:
        | {
            id: number;
            x: number;
            y: number;
            cx: number;
            cy: number;
            moved: boolean;
          }
        | undefined;
      let suppress = false;
      host.addEventListener(
        "pointerdown",
        (e) => {
          if (e.button !== 0) return;
          suppress = false;
          drag = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            cx: camera.x,
            cy: camera.y,
            moved: false,
          };
        },
        { signal: abort.signal },
      );
      host.addEventListener(
        "pointermove",
        (e) => {
          if (!drag || e.pointerId !== drag.id) return;
          if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) {
            drag.moved = true;
            host.setPointerCapture(e.pointerId);
            camera.x = drag.cx - (e.clientX - drag.x) / camera.scale;
            camera.y = drag.cy - (e.clientY - drag.y) / camera.scale;
            camera.fitted = false;
            draw();
          }
        },
        { signal: abort.signal },
      );
      const end = () => {
        suppress = !!drag?.moved;
        drag = undefined;
      };
      host.addEventListener("pointerup", end, { signal: abort.signal });
      host.addEventListener("pointercancel", end, { signal: abort.signal });
      host.addEventListener(
        "click",
        (e) => {
          if (suppress) {
            suppress = false;
            return;
          }
          const node = (e.target as Element).closest<SVGGElement>("g[data-id]");
          const id = node?.dataset.id;
          if (id && catalog.has(id)) callbacks.current.onSelect(id);
        },
        { signal: abort.signal },
      );
      host.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter" || e.key === " ") {
            const id = (e.target as Element).closest<SVGGElement>("g[data-id]")
              ?.dataset.id;
            if (id && catalog.has(id)) {
              e.preventDefault();
              callbacks.current.onSelect(id);
              return;
            }
          }
          if (e.key === "+" || e.key === "=") zoomTo(camera.scale * 1.2);
          else if (e.key === "-") zoomTo(camera.scale / 1.2);
          else if (e.key === "Home") fit();
          else if (e.key.startsWith("Arrow")) {
            camera.x +=
              (e.key === "ArrowLeft" ? -60 : e.key === "ArrowRight" ? 60 : 0) /
              camera.scale;
            camera.y +=
              (e.key === "ArrowUp" ? -60 : e.key === "ArrowDown" ? 60 : 0) /
              camera.scale;
            camera.fitted = false;
            draw();
          } else return;
          e.preventDefault();
        },
        { signal: abort.signal },
      );
      host.addEventListener(
        "wheel",
        (e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const rect = host.getBoundingClientRect();
          zoomTo(
            camera.scale * Math.exp(-e.deltaY * 0.003),
            e.clientX - rect.left,
            e.clientY - rect.top,
          );
        },
        { signal: abort.signal, passive: false },
      );
      setError("");
    } catch {
      setError(
        "This diagram could not be displayed. Download the BPMN model to inspect it.",
      );
    }
    const pageHide = () => flush();
    window.addEventListener("pagehide", pageHide);
    return () => {
      clearTimeout(saveTimer);
      flush();
      window.removeEventListener("pagehide", pageHide);
      abort.abort();
      observer?.disconnect();
      controls.current = null;
      host.replaceChildren();
    };
  }, [view, elements, storageKey]);

  useEffect(() => {
    const focus = focusRequest > consumedFocus.current;
    controls.current?.select?.(selected, focus);
    consumedFocus.current = focusRequest;
  }, [selected, focusRequest, view]);
  return (
    <div className="canvas-wrap relative min-w-0">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Diagram unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div
        ref={stage}
        id="diagram-stage"
        tabIndex={0}
        aria-label={`${view.title} diagram. Drag to pan; use plus and minus to zoom.`}
        className="diagram-stage"
      />
    </div>
  );
}
