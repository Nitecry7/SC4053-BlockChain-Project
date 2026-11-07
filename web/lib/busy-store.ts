// A tiny external store: is an order or approval request in flight anywhere on the page? The market picker reads it so
// the market cannot be switched (which would remount the ticket and orphan an open wallet request).
let busy = false;
const listeners = new Set<() => void>();

export const setOrderBusy = (value: boolean) => {
  if (busy === value) return;
  busy = value;
  listeners.forEach((l) => l());
};
export const getOrderBusy = () => busy;
export const subscribeOrderBusy = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
