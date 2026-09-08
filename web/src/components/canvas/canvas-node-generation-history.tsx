import { useEffect, useState } from "react";
import { Image, Modal } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { resolveImageUrl } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

export function CanvasNodeGenerationHistory({ node, onClose }: { node: CanvasNodeData | null; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const history = node?.metadata?.generationHistory || [];
    return (
        <Modal title="生成历史" open={Boolean(node)} onCancel={onClose} footer={null} width={720} centered>
            <div className="thin-scrollbar max-h-[65vh] space-y-4 overflow-auto" style={{ color: theme.node.text }} data-canvas-shortcuts-ignore>
                {!history.length ? <div className="py-10 text-center opacity-60">暂无历史内容，重新生成后可在这里查看之前的结果。</div> : null}
                {node ? [...history].reverse().map((entry, index) => (
                    <div key={entry.id} className="space-y-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke }}>
                        <div className="text-sm font-medium">历史生成 {history.length - index}</div>
                        <HistoryContent type={node.type} metadata={entry.metadata} />
                        {entry.metadata.prompt ? <div className="whitespace-pre-wrap break-words text-xs opacity-65">{entry.metadata.prompt}</div> : null}
                    </div>
                )) : null}
            </div>
        </Modal>
    );
}

function HistoryContent({ type, metadata }: { type: CanvasNodeData["type"]; metadata: CanvasNodeMetadata }) {
    const [urls, setUrls] = useState<string[]>([]);
    const [error, setError] = useState(false);
    useEffect(() => {
        if (type === CanvasNodeType.Text) return;
        let canceled = false;
        setUrls([]);
        setError(false);
        const items = type === CanvasNodeType.Image && metadata.images?.some((image) => image.content) ? metadata.images.filter((image) => image.content) : [metadata];
        const resolve = type === CanvasNodeType.Image ? resolveImageUrl : resolveMediaUrl;
        Promise.all(items.map((item) => resolve(item.storageKey, item.content))).then(
            (values) => { if (!canceled) setUrls(values); },
            () => { if (!canceled) setError(true); },
        );
        return () => { canceled = true; };
    }, [metadata, type]);

    if (type === CanvasNodeType.Text) {
        const texts = metadata.texts?.some((text) => text.content) ? metadata.texts.filter((text) => text.content) : [metadata];
        return <div className="space-y-3">{texts.map((text, index) => <pre key={index} className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{text.content}</pre>)}</div>;
    }
    if (error) return <div className="text-sm opacity-60">历史内容读取失败，请关闭后重试。</div>;
    if (!urls.length) return <div className="text-sm opacity-60">正在读取历史内容…</div>;
    if (type === CanvasNodeType.Image) return <Image.PreviewGroup><div className="grid grid-cols-2 gap-2">{urls.map((url, index) => <Image key={index} src={url} alt={`历史图片 ${index + 1}`} className="max-h-72 object-contain" />)}</div></Image.PreviewGroup>;
    if (type === CanvasNodeType.Video) return <video src={urls[0]} controls preload="metadata" className="max-h-80 w-full rounded-lg" />;
    return <audio src={urls[0]} controls preload="metadata" className="w-full" />;
}
