import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type UIEvent } from "react";

export function useAssetSelection() {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const drag = useRef<{ pointerId: number; x: number; y: number; clientX: number; clientY: number; initial: Set<string>; additive: boolean; moved: boolean } | null>(null);
    const suppressClick = useRef(false);

    const cancelSelection = () => {
        if (drag.current) setSelectedIds(drag.current.initial);
        drag.current = null;
        setSelectionRect(null);
    };

    useEffect(() => {
        window.addEventListener("blur", cancelSelection);
        return () => window.removeEventListener("blur", cancelSelection);
    }, []);

    const updateSelection = (container: HTMLDivElement, clientX: number, clientY: number) => {
        const current = drag.current;
        if (!current) return;
        // 沿用画布区分单击与拖动的 3px 判定。
        if (!current.moved && Math.abs(clientX - current.clientX) <= 3 && Math.abs(clientY - current.clientY) <= 3) return;
        current.moved = true;
        current.clientX = clientX;
        current.clientY = clientY;
        suppressClick.current = true;
        const bounds = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(container.clientWidth, clientX - bounds.left)) + container.scrollLeft;
        const y = Math.max(0, Math.min(container.clientHeight, clientY - bounds.top)) + container.scrollTop;
        const rect = { left: Math.min(current.x, x), top: Math.min(current.y, y), width: Math.abs(x - current.x), height: Math.abs(y - current.y) };
        const next = new Set(current.additive ? current.initial : []);
        container.querySelectorAll<HTMLElement>("[data-asset-id]").forEach((card) => {
            const cardBounds = card.getBoundingClientRect();
            const left = cardBounds.left - bounds.left + container.scrollLeft;
            const top = cardBounds.top - bounds.top + container.scrollTop;
            if (left <= rect.left + rect.width && left + cardBounds.width >= rect.left && top <= rect.top + rect.height && top + cardBounds.height >= rect.top) next.add(card.dataset.assetId!);
        });
        setSelectionRect(rect);
        setSelectedIds((previous) => previous.size === next.size && [...next].every((id) => previous.has(id)) ? previous : next);
    };

    const selectionHandlers = {
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0 || event.pointerType === "touch") return;
            const target = event.target as HTMLElement;
            const card = target.closest<HTMLElement>("[data-asset-id]");
            if (!card && target.closest("button")) return;
            const container = event.currentTarget;
            const bounds = container.getBoundingClientRect();
            if (event.clientX - bounds.left >= container.clientWidth) return;
            suppressClick.current = false;
            drag.current = { pointerId: event.pointerId, x: event.clientX - bounds.left + container.scrollLeft, y: event.clientY - bounds.top + container.scrollTop, clientX: event.clientX, clientY: event.clientY, initial: new Set(selectedIds), additive: event.ctrlKey || event.metaKey, moved: false };
            (card || container).setPointerCapture(event.pointerId);
            event.stopPropagation();
        },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            updateSelection(event.currentTarget, event.clientX, event.clientY);
            event.stopPropagation();
        },
        onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            updateSelection(event.currentTarget, event.clientX, event.clientY);
            if (!drag.current.moved && !(event.target as HTMLElement).closest("[data-asset-id]") && !drag.current.additive) setSelectedIds(new Set());
            drag.current = null;
            setSelectionRect(null);
            event.stopPropagation();
        },
        onPointerCancel: cancelSelection,
        onLostPointerCapture: cancelSelection,
        onScroll: (event: UIEvent<HTMLDivElement>) => {
            if (drag.current?.moved) updateSelection(event.currentTarget, drag.current.clientX, drag.current.clientY);
        },
        onDragStart: (event: React.DragEvent<HTMLDivElement>) => event.preventDefault(),
        onClickCapture: (event: MouseEvent<HTMLDivElement>) => {
            if (!suppressClick.current || event.detail === 0) return;
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
        },
    };

    return { selectedIds, setSelectedIds, selectionRect, selectionHandlers };
}
