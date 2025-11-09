/**
 * 简易 DOM 事件管理器，集中注册与清理事件监听，避免组件销毁后遗留引用。
 */
export class DomEventManager {
private disposers: Array<() => void> = [];

add(
    target: EventTarget | null | undefined,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
): void {
    if (!target) {
        return;
}
    target.addEventListener(type, handler, options);
    this.disposers.push(() => {
        target.removeEventListener(type, handler, options);
    });
}

dispose(): void {
    if (this.disposers.length === 0) {
     return;
}
    this.disposers.forEach(dispose => dispose());
    this.disposers = [];
}
}
