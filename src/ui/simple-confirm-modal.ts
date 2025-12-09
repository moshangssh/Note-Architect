import { App, ButtonComponent, Modal } from "obsidian";

export interface SimpleConfirmModalOptions {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  confirmClass?: string;
  cancelClass?: string;
}

export class SimpleConfirmModal extends Modal {
  private resolvePromise?: (result: boolean) => void;
  private settled = false;
  private readonly options: SimpleConfirmModalOptions;

  constructor(app: App, options: SimpleConfirmModalOptions) {
    super(app);
    this.options = options;
  }

  openAndWait(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    const content = this.contentEl;
    content.empty();

    content.createEl("p", { text: this.options.message });

    const actions = content.createDiv("modal-button-container");

    new ButtonComponent(actions)
      .setButtonText(this.options.confirmText)
      .setClass(this.options.confirmClass ?? "mod-cta")
      .onClick(() => this.closeWith(true));

    new ButtonComponent(actions)
      .setButtonText(this.options.cancelText)
      .setClass(this.options.cancelClass ?? "")
      .onClick(() => this.closeWith(false));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.resolvePromise?.(false);
    }
  }

  private closeWith(result: boolean): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolvePromise?.(result);
    this.close();
  }
}
