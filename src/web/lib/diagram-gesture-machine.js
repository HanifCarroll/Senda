import { createActor, createMachine, types } from 'xstate';

/** @param {{capture: (id: number) => void, pan: (drag: any) => void, select: (id?: string) => void}} services */
export function createDiagramGestureMachine(services) {
  const select = ({ event }, enq) => {
    enq(services.select, event.id);
    return {};
  };
  const move = ({ context, event }, enq) => {
    const pointer = context.pointer;
    if (event.pointerId !== pointer.id) return;
    const dx = event.x - pointer.x, dy = event.y - pointer.y;
    if (Math.hypot(dx, dy) <= 5) return;
    enq(services.capture, pointer.id);
    enq(services.pan, { cx: pointer.cx, cy: pointer.cy, dx, dy });
    return { target: 'panning' };
  };
  const end = target => ({ context, event }) => event.pointerId === context.pointer.id
    ? { target, context: { pointer: null } } : undefined;
  return createMachine({
    id: 'diagram-gesture',
    schemas: { events: {
      PRESS: /** @type {import('xstate').TypeSchema<{ pointerId: number, button: number, x: number, y: number, cx: number, cy: number }>} */ (types()),
      MOVE: /** @type {import('xstate').TypeSchema<{ pointerId: number, x: number, y: number }>} */ (types()),
      RELEASE: /** @type {import('xstate').TypeSchema<{ pointerId: number }>} */ (types()),
      CANCEL: /** @type {import('xstate').TypeSchema<{ pointerId: number }>} */ (types()),
      CLICK: /** @type {import('xstate').TypeSchema<{ id?: string }>} */ (types()),
    } },
    context: /** @type {{ pointer: any }} */ ({ pointer: null }),
    initial: 'idle',
    on: {
      PRESS: ({ event }) => event.button === 0 ? {
        target: '.pressed',
        context: { pointer: { id: event.pointerId, x: event.x, y: event.y, cx: event.cx, cy: event.cy } },
      } : undefined,
      CLICK: select,
    },
    states: {
      idle: {},
      pressed: { on: { MOVE: move, RELEASE: end('idle'), CANCEL: end('idle') } },
      panning: { on: { MOVE: move, RELEASE: end('suppressingClick'), CANCEL: end('suppressingClick') } },
      suppressingClick: { on: { CLICK: { target: 'idle' } } },
    },
  });
}

/** The actor stays within the canvas effect; pointer moves do not render React.
 * @param {HTMLElement} host
 * @param {{camera: () => {x: number, y: number}, capture: (id: number) => void, pan: (drag: any) => void, select: (id?: string) => void}} services
 * @param {AbortSignal} signal
 */
export function bindDiagramGestures(host, services, signal) {
  const actor = createActor(createDiagramGestureMachine(services)).start();
  signal.addEventListener('abort', () => actor.stop(), { once: true });
  host.addEventListener('pointerdown', e => {
    const camera = services.camera();
    actor.send({ type: 'PRESS', pointerId: e.pointerId, button: e.button, x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y });
  }, { signal });
  host.addEventListener('pointermove', e => actor.send({ type: 'MOVE', pointerId: e.pointerId, x: e.clientX, y: e.clientY }), { signal });
  host.addEventListener('pointerup', e => actor.send({ type: 'RELEASE', pointerId: e.pointerId }), { signal });
  host.addEventListener('pointercancel', e => actor.send({ type: 'CANCEL', pointerId: e.pointerId }), { signal });
  host.addEventListener('click', e => {
    const node = /** @type {Element} */ (e.target).closest('g[data-id]');
    actor.send({ type: 'CLICK', id: node?.getAttribute('data-id') || undefined });
  }, { signal });
}
