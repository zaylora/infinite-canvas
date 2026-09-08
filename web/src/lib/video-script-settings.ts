import { clampVideoSeconds, computeVideoSize, inferVideoRatio, parseVideoResolution, videoRatioOptions } from "@/lib/media-size";
import { resolveModelScript, type AiConfig } from "@/stores/use-config-store";

export type VideoScriptSettings = {
    resolution?: string[];
    ratio?: string[];
    seconds?: { min: number; max: number; default?: number };
    mode?: string[];
};

export const videoSettingsExample = `/* @videoSettings
{
  "resolution": ["480", "768", "1080"],
  "ratio": ["16:9", "9:16", "1:1"],
  "seconds": { "min": 1, "max": 10, "default": 6 },
  "mode": ["reference"]
}
*/`;

export const videoSettingsHelp = `视频脚本可在最顶部加入以下 JSON 注释，按当前渠道和模型配置视频设置面板（示例值请按接口文档修改）：
${videoSettingsExample}
各字段均可省略，省略则沿用通用设置。resolution 为不带 p 的正整数字符串数组；ratio 支持 1:1、3:4、4:3、16:9、9:16、21:9、auto；mode 支持 frames、reference。数组不能为空，首项是当前选项不受支持时的回退值。seconds 的 min/max 为正整数且 min 不大于 max；default 可省略，省略时使用范围内的 6 秒。超范围的当前时长使用默认值。声明清晰度或比例后禁止手填宽高，避免绕过选项限制；声明清晰度后不显示自定义清晰度输入。声明仅解析 JSON，不执行脚本。请求仍接收 params.seconds/resolution/ratio/size/mode。`;

export function parseVideoScriptSettings(script: string): VideoScriptSettings | undefined {
    if (!script.trimStart().startsWith("/* @videoSettings")) return;
    const end = script.indexOf("*/");
    if (end < 0) throw new Error("视频设置声明缺少结束标记 */");
    let value;
    try {
        value = JSON.parse(script.slice(script.indexOf("@videoSettings") + "@videoSettings".length, end));
    } catch {
        throw new Error("视频设置声明必须是有效 JSON");
    }
    const invalid = (detail: string): never => { throw new Error(`视频设置声明错误：${detail}`); };
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid("必须填写对象");
    for (const key of Object.keys(value)) {
        if (!["resolution", "ratio", "seconds", "mode"].includes(key)) invalid(`不支持字段 ${key}`);
    }
    for (const key of ["resolution", "ratio", "mode"] as const) {
        const items = value[key];
        if (items === undefined) continue;
        if (!Array.isArray(items) || !items.length || items.some((item: unknown) => typeof item !== "string") || new Set(items).size !== items.length) invalid(`${key} 必须是非空、不重复的字符串数组`);
        if (key === "resolution" && items.some((item: string) => !/^[1-9]\d*$/.test(item) || !Number.isSafeInteger(Number(item)))) invalid("resolution 必须是不带 p 的正整数字符串");
        if (key === "ratio" && items.some((item: string) => !videoRatioOptions.some((option) => option.value === item))) invalid("ratio 包含不支持的比例");
        if (key === "mode" && items.some((item: string) => !["frames", "reference"].includes(item))) invalid("mode 仅支持 frames、reference");
    }
    if (value.seconds !== undefined) {
        const seconds = value.seconds;
        if (!seconds || typeof seconds !== "object" || Array.isArray(seconds)) invalid("seconds 必须填写对象");
        if (Object.keys(seconds).some((key) => !["min", "max", "default"].includes(key))) invalid("seconds 仅支持 min、max、default");
        if (!Number.isSafeInteger(seconds.min) || !Number.isSafeInteger(seconds.max) || seconds.min <= 0 || seconds.max < seconds.min) invalid("seconds 的 min/max 必须是有效的正整数范围");
        if (seconds.default !== undefined && (!Number.isSafeInteger(seconds.default) || seconds.default < seconds.min || seconds.default > seconds.max)) invalid("seconds.default 必须是范围内的整数");
    }
    return value;
}

export function resolveVideoScriptSettings(config: AiConfig) {
    return parseVideoScriptSettings(resolveModelScript(config, config.model || config.videoModel));
}

export function applyVideoScriptSettings(config: AiConfig, settings = resolveVideoScriptSettings(config)): AiConfig {
    if (!settings) return config;
    const choose = (value: string, options?: string[]) => options && !options.includes(value) ? options[0] : value;
    const resolution = choose(parseVideoResolution(config.vquality), settings.resolution);
    const ratio = choose(inferVideoRatio(config.size), settings.ratio);
    const range = settings.seconds;
    const seconds = Number(config.videoSeconds);
    const duration = range
        ? Number.isInteger(seconds) && seconds >= range.min && seconds <= range.max ? seconds : range.default ?? Math.max(range.min, Math.min(range.max, 6))
        : clampVideoSeconds(config.videoSeconds);
    return {
        ...config,
        vquality: resolution,
        size: settings.resolution || settings.ratio ? computeVideoSize(resolution, ratio) : config.size,
        videoSeconds: String(duration),
        videoMode: choose(config.videoMode === "reference" ? "reference" : "frames", settings.mode),
    };
}
