export const mockNoticeConstructor = jest.fn();

export class App {}
export class Editor {}
export class MarkdownView {}
export class Modal {}
export class Notice {
    constructor(message: string) {
        mockNoticeConstructor(message);
    }
}
export class Plugin {
    app: any;
    manifest: any;
    constructor(app?: any, manifest?: any) {
        this.app = app;
        this.manifest = manifest;
    }
}
export class PluginSettingTab {}
export class Setting {}
export class Component {}
export class MarkdownRenderer {}

// Mock HTMLElement 扩展方法（Obsidian API）
declare global {
    interface HTMLElement {
        createDiv(clsOrOptions?: string | { cls?: string }): HTMLDivElement;
        createEl<T extends keyof HTMLElementTagNameMap>(
            tag: T,
            options?: { text?: string; cls?: string; attr?: Record<string, string>; type?: string; value?: string; placeholder?: string }
        ): HTMLElementTagNameMap[T];
        createSpan(options?: { text?: string; cls?: string; attr?: Record<string, string> }): HTMLSpanElement;
        setText(text: string): void;
        setAttr(key: string, value: string): void;
        addClass(cls: string): void;
        empty(): void;
    }
}

// Mock DragEvent and DataTransfer
global.DataTransfer = jest.fn().mockImplementation(() => ({
    setData: jest.fn(),
    getData: jest.fn(),
    setDragImage: jest.fn(),
    effectAllowed: '',
    dropEffect: '',
}));

global.DragEvent = jest.fn().mockImplementation((type, options) => {
    const event = new Event(type, {
        bubbles: options?.bubbles || false,
        cancelable: options?.cancelable || false,
    });

    Object.defineProperty(event, 'dataTransfer', {
        value: options?.dataTransfer || new DataTransfer(),
        writable: false,
    });

    Object.defineProperty(event, 'clientY', {
        value: options?.clientY || 0,
        writable: false,
    });

    return event;
}) as any;

// 实现 HTMLElement 扩展方法
HTMLElement.prototype.createDiv = function(cls?: string): HTMLDivElement {
    const div = document.createElement('div');
    if (cls) {
        div.className = cls;
    }
    this.appendChild(div);
    return div;
};

HTMLElement.prototype.createEl = function<T extends keyof HTMLElementTagNameMap>(
    tag: T,
    options?: { text?: string; cls?: string; attr?: Record<string, string>; type?: string; value?: string; placeholder?: string }
): HTMLElementTagNameMap[T] {
    const el = document.createElement(tag);

    if (options?.cls) {
        el.className = options.cls;
    }

    if (options?.text) {
        el.textContent = options.text;
    }

    if (options?.type && (tag === 'input' || tag === 'select')) {
        (el as any).type = options.type;
    }

    if (options?.value !== undefined && (tag === 'input' || tag === 'select' || tag === 'option')) {
        (el as HTMLInputElement | HTMLSelectElement | HTMLOptionElement).value = options.value;
    }

    if (options?.placeholder && tag === 'input') {
        (el as HTMLInputElement).placeholder = options.placeholder;
    }

    if (options?.attr) {
        Object.entries(options.attr).forEach(([key, value]) => {
            el.setAttribute(key, value);
        });
    }

    this.appendChild(el);
    return el as HTMLElementTagNameMap[T];
};

// 为了支持对象语法，重载 createDiv 方法
HTMLElement.prototype.createDiv = function(clsOrOptions?: string | { cls?: string }): HTMLDivElement {
    const div = document.createElement('div');

    if (typeof clsOrOptions === 'string') {
        div.className = clsOrOptions;
    } else if (clsOrOptions?.cls) {
        div.className = clsOrOptions.cls;
    }

    this.appendChild(div);
    return div;
};

HTMLElement.prototype.createSpan = function(options?: { text?: string; cls?: string; attr?: Record<string, string> }): HTMLSpanElement {
    const span = document.createElement('span');

    if (options?.cls) {
        span.className = options.cls;
    }

    if (options?.text) {
        span.textContent = options.text;
    }

    if (options?.attr) {
        Object.entries(options.attr).forEach(([key, value]) => {
            span.setAttribute(key, value);
        });
    }

    this.appendChild(span);
    return span;
};

HTMLElement.prototype.setText = function(text: string): void {
    this.textContent = text;
};

HTMLElement.prototype.setAttr = function(key: string, value: string): void {
    this.setAttribute(key, value);
};

HTMLElement.prototype.addClass = function(cls: string): void {
    this.classList.add(cls);
};

HTMLElement.prototype.empty = function(): void {
    this.innerHTML = '';
};
