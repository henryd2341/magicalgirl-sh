import { reactive } from "vue";

type DialogType = "alert" | "confirm";

interface DialogState {
  visible: boolean;
  type: DialogType;
  message: string;
  confirmText: string;
  cancelText: string;
}

type ResolveFn = ((value: boolean | void) => void) | null;

const state = reactive<DialogState>({
  visible: false,
  type: "alert",
  message: "",
  confirmText: "确定",
  cancelText: "取消",
});

let resolver: ResolveFn = null;

function openDialog(
  type: DialogType,
  message: string,
  options?: { confirmText?: string; cancelText?: string },
): Promise<boolean | void> {
  // If a dialog is already open, resolve it first
  if (state.visible && resolver) {
    const prev = resolver;
    resolver = null;
    prev(type === "confirm" ? false : undefined);
  }

  state.type = type;
  state.message = message;
  state.confirmText = options?.confirmText ?? "确定";
  state.cancelText = options?.cancelText ?? "取消";
  state.visible = true;

  return new Promise<boolean | void>((resolve) => {
    resolver = resolve;
  });
}

function resolveDialog(value: boolean | void) {
  state.visible = false;
  if (resolver) {
    const fn = resolver;
    resolver = null;
    fn(value);
  }
}

export function useGameDialog() {
  function alert(message: string): Promise<void> {
    return openDialog("alert", message) as Promise<void>;
  }

  function confirm(
    message: string,
    options?: { confirmText?: string; cancelText?: string },
  ): Promise<boolean> {
    return openDialog("confirm", message, options) as Promise<boolean>;
  }

  function handleConfirm() {
    resolveDialog(state.type === "confirm" ? true : undefined);
  }

  function handleCancel() {
    resolveDialog(state.type === "confirm" ? false : undefined);
  }

  return {
    state,
    alert,
    confirm,
    handleConfirm,
    handleCancel,
  };
}
