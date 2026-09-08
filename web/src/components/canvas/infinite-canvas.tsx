import React, { useCallback, useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "@/types/canvas";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    tool: "select" | "pan";
    onToolChange: (tool: "select" | "pan") => void;
    backgroundMode?: CanvasBackgroundMode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onCanvasDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

export function InfiniteCanvas({ containerRef, viewport, tool, onToolChange, backgroundMode = "lines", onViewportChange, onCanvasMouseDown, onCanvasDeselect, onCanvasDoubleClick, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
        startedOnBackground: false,
        pointerId: null as number | null,
    });
    const scaleRef = useRef(viewport.k);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const toolBeforeSpace = useRef<"select" | "pan" | null>(null);
    const [isPanning, setIsPanning] = useState(false);

    useEffect(() => {
        scaleRef.current = viewport.k;
    }, [viewport.k]);

    useEffect(
        () => () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-shortcuts-ignore]")) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            toolBeforeSpace.current = tool;
            onToolChange("pan");
        };

        const releaseSpace = () => {
            if (toolBeforeSpace.current === null) return;
            onToolChange(toolBeforeSpace.current);
            toolBeforeSpace.current = null;
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") {
                const target = event.target instanceof Element ? event.target : null;
                if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-shortcuts-ignore]"))) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                releaseSpace();
            }
        };

        const handleBlur = () => {
            releaseSpace();
            const pointerId = panState.current.pointerId;
            if (pointerId !== null && containerRef.current?.hasPointerCapture(pointerId)) containerRef.current.releasePointerCapture(pointerId);
            panState.current.isPanning = false;
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
            setIsPanning(false);
            document.body.style.cursor = "";
        };

        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("keyup", handleKeyUp, true);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("keyup", handleKeyUp, true);
            window.removeEventListener("blur", handleBlur);
        };
    }, [containerRef, onToolChange, tool]);

    useEffect(() => {
        if (tool === "pan") {
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && containerRef.current?.contains(focused)) focused.blur();
            return;
        }
        toolBeforeSpace.current = null;
        panState.current.isPanning = false;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        const pointerId = panState.current.pointerId;
        if (pointerId !== null && containerRef.current?.hasPointerCapture(pointerId)) containerRef.current.releasePointerCapture(pointerId);
        setIsPanning(false);
        document.body.style.cursor = "";
    }, [containerRef, tool]);

    const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement> | WheelEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;
        if (!event.ctrlKey && target?.closest("[data-canvas-no-zoom]")) return;

        if (!event.ctrlKey) {
            onViewportChange({
                x: viewport.x - (event.shiftKey ? event.deltaY || event.deltaX : event.deltaX),
                y: viewport.y - (event.shiftKey ? 0 : event.deltaY),
                k: viewport.k,
            });
            return;
        }

        const delta = -event.deltaY;
        const factor = Math.pow(1.1, delta / 100);
        const newScale = Math.min(Math.max(viewport.k * factor, 0.05), 5);
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const worldX = (mouseX - viewport.x) / viewport.k;
        const worldY = (mouseY - viewport.y) / viewport.k;

        onViewportChange({
            x: mouseX - worldX * newScale,
            y: mouseY - worldY * newScale,
            k: newScale,
        });
    }, [containerRef, onViewportChange, viewport]);

    const handlePointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        const target = event.target instanceof Element ? event.target : null;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
        const shouldPan = event.button === 1 || (event.button === 0 && tool === "pan");

        if (shouldPan) {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: viewport.x,
                initialY: viewport.y,
                hasMoved: false,
                startedOnBackground: isBackgroundClick,
                pointerId: event.pointerId,
            };
            setIsPanning(true);
            document.body.style.cursor = "grabbing";
            return;
        }
    };

    useEffect(() => {
        // 在子控件拦截滚轮前阻止浏览器缩放，Ctrl + 滚轮只缩放画布。
        const handleControlWheel = (event: WheelEvent) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            const target = event.target instanceof Element ? event.target : null;
            // 弹窗内的图片编辑器等保留自身滚轮交互，不缩放背后的画布。
            if (target?.closest(".ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;
            event.stopPropagation();
            handleWheel(event);
        };
        window.addEventListener("wheel", handleControlWheel, { capture: true, passive: false });
        return () => window.removeEventListener("wheel", handleControlWheel, true);
    }, [handleWheel]);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");
        if (event.button === 0 && isBackgroundClick) {
            event.preventDefault();
            // 阻止默认行为后需主动释放焦点，避免视频控件继续接收空格。
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && event.currentTarget.contains(focused)) focused.blur();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
        }
    };

    const blockPanInteraction = (event: React.SyntheticEvent<HTMLDivElement>) => {
        if (tool !== "pan" || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
    };

    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],[data-node-id],[data-connection-id]")) return;
        onCanvasDoubleClick?.(event);
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            nextViewportRef.current = {
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                frameRef.current = null;
                if (nextViewportRef.current) onViewportChange(nextViewportRef.current);
            });
        };

        const handlePointerUp = () => {
            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved && panState.current.startedOnBackground) {
                onCanvasDeselect?.();
            }
            panState.current.isPanning = false;
            setIsPanning(false);
            document.body.style.cursor = "";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            document.body.style.cursor = "";
        };
    }, [onCanvasDeselect, onViewportChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Prevent canvas scrolling from moving the page while preserving native scrolling inside overlays and dialogs.
        const preventWheelScroll = (event: WheelEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;
            event.preventDefault();
        };
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        return () => container.removeEventListener("wheel", preventWheelScroll);
    }, [containerRef]);

    const cursor = isPanning ? "grabbing" : tool === "pan" ? "grab" : undefined;

    return (
        <div
            ref={containerRef}
            className={`relative h-full w-full select-none overflow-hidden ${isPanning ? "[&_*]:!cursor-grabbing" : tool === "pan" ? "[&_*]:!cursor-grab" : ""}`}
            style={{ background: theme.canvas.background, cursor }}
            onPointerDown={handlePointerDown}
            onPointerDownCapture={handlePointerDownCapture}
            onMouseDownCapture={blockPanInteraction}
            onClickCapture={blockPanInteraction}
            onDoubleClickCapture={blockPanInteraction}
            onContextMenuCapture={blockPanInteraction}
            onKeyDownCapture={blockPanInteraction}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={viewport} mode={backgroundMode} />
            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
                }}
            >
                {children}
            </div>
        </div>
    );
}

function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
