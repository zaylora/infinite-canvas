import type { CanvasNodeData, Position } from "@/types/canvas";

// 为整批网格预留空间，避免任何新增节点与已有节点重叠。
export function layoutAssetNodes(nodes: CanvasNodeData[], existing: CanvasNodeData[], center: Position) {
    if (!nodes.length) return [];
    const gap = 96;
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const cellWidth = nodes.reduce((width, node) => Math.max(width, node.width), 0);
    const cellHeight = nodes.reduce((height, node) => Math.max(height, node.height), 0);
    const width = columns * (cellWidth + gap) - gap;
    const height = Math.ceil(nodes.length / columns) * (cellHeight + gap) - gap;
    let left = center.x - width / 2;
    const top = center.y - height / 2;
    let collision: CanvasNodeData | undefined;
    while ((collision = existing.find((node) =>
        left < node.position.x + node.width + gap && left + width + gap > node.position.x
        && top < node.position.y + node.height + gap && top + height + gap > node.position.y
    ))) {
        left = collision.position.x + collision.width + gap;
    }
    return nodes.map((node, index) => ({
        ...node,
        position: {
            x: left + (index % columns) * (cellWidth + gap) + (cellWidth - node.width) / 2,
            y: top + Math.floor(index / columns) * (cellHeight + gap) + (cellHeight - node.height) / 2,
        },
    }));
}
