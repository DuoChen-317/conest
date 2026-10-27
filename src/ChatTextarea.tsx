import { useEffect, useRef, type ComponentProps } from "react";
import { enterAction } from "./chat-input";

export default function ChatTextarea(
  props: Omit<ComponentProps<"textarea">, "ref">,
) {
  const composing = useRef(false);
  const node = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!props.disabled && restoreFocus.current) {
      restoreFocus.current = false;
      if (document.activeElement === document.body)
        node.current?.focus({ preventScroll: true });
    }
  }, [props.disabled]);
  return (
    <textarea
      {...props}
      ref={node}
      onCompositionStart={(e) => {
        composing.current = true;
        props.onCompositionStart?.(e);
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        props.onCompositionEnd?.(e);
      }}
      onKeyDown={(e) => {
        props.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        const action = enterAction({
          key: e.key,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          repeat: e.repeat,
          isComposing: composing.current || e.nativeEvent.isComposing,
          keyCode: e.nativeEvent.keyCode,
        });
        if (action === "newline") return;
        e.preventDefault();
        if (
          action === "send" &&
          !props.disabled &&
          !props.readOnly &&
          e.currentTarget.value.trim()
        ) {
          restoreFocus.current = true;
          e.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
