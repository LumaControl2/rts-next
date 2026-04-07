// Event bus for assistant → page communication
// When the assistant executes an action, it emits an event
// Pages listen for events and refresh their data

export type AssistantEvent = {
  type: 'POZO_REGISTRADO' | 'JORNADA_CREADA' | 'CIERRE_ACTUALIZADO' | 'DATOS_CAMBIARON' | 'NAVEGAR';
  payload?: any;
};

export function emitAssistantEvent(event: AssistantEvent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('assistant-action', { detail: event }));
}

export function onAssistantEvent(callback: (event: AssistantEvent) => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => callback((e as CustomEvent).detail);
  window.addEventListener('assistant-action', handler);
  return () => window.removeEventListener('assistant-action', handler);
}
