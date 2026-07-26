import * as React from "react";

interface UseCompositionOptions<T extends HTMLElement> {
  onKeyDown?: (e: React.KeyboardEvent<T>) => void;
  onCompositionStart?: (e: React.CompositionEvent<T>) => void;
  onCompositionEnd?: (e: React.CompositionEvent<T>) => void;
}

export function useComposition<T extends HTMLElement>({
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
}: UseCompositionOptions<T>) {
  const isComposing = React.useRef(false);

  const handleCompositionStart = React.useCallback(
    (e: React.CompositionEvent<T>) => {
      isComposing.current = true;
      onCompositionStart?.(e);
    },
    [onCompositionStart]
  );

  const handleCompositionEnd = React.useCallback(
    (e: React.CompositionEvent<T>) => {
      isComposing.current = false;
      onCompositionEnd?.(e);
    },
    [onCompositionEnd]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<T>) => {
      onKeyDown?.(e);
    },
    [onKeyDown]
  );

  return {
    isComposing: () => isComposing.current,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  };
}
