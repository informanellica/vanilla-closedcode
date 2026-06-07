class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeWebSocket.CONNECTING;
  closed = false;
  sent = [];
  listeners = new Map();
  constructor(url, options) {
    this.url = url;
    this.options = options;
  }
  addEventListener(type, listener) {
    const current = this.listeners.get(type) ?? new Set();
    current.add(listener);
    this.listeners.set(type, current);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }
  message(data) {
    this.emit("message", {
      data
    });
  }
  emit(type, event) {
    this.listeners.get(type)?.forEach(listener => listener(event));
  }
}
export { FakeWebSocket };