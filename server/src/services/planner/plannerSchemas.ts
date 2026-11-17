import { z } from "zod";
import type { PlannerOutput } from "./plannerOutputNormalization";

// Planner 输出需要尽量宽容：不同模型可能在字段类型上有差异（字符串/数组等）。
// 但 top-level 必须是对象，且 scenes 必须是数组（或可修复为数组）。

const plannerSceneSchema = z.object({
  title: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  conflict: z.string().trim().min(1),
  reveal: z.string().trim().min(1),
  emotionBeat: z.string().trim().min(1),
}).passthrough();

// 注意：这里的必填声明不是"从严"，而是让 JSON Schema 的 required 和
// plannerPlan.prompts.ts 的 postValidate 保持一致。两者不一致时，模型能交上
// 结构合法但业务残缺的 JSON（实测出现过只返回 {"title":"第1章：试探器灵"}），
// 于是白跑一次生成 + 一次语义重试。类型上的宽容（数组/字符串差异）仍然保留，
// 只把 postValidate 强制存在的字段标成必填。
export const plannerOutputSchema = z.object({
  title: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  participants: z.array(z.string().trim()).optional(),
  reveals: z.array(z.string().trim()).optional(),
  riskNotes: z.array(z.string().trim()).optional(),
  hookTarget: z.string().trim().optional(),
  // book/arc 层级的 planRole 允许空字符串（见 postValidate 的说明），
  // 这里把 "" 归一成 undefined，既接受模型给空串，也不污染下游类型。
  planRole: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.enum(["setup", "progress", "pressure", "turn", "payoff", "cooldown"]).nullable().optional(),
  ),
  phaseLabel: z.string().trim().min(1),
  mustAdvance: z.array(z.string().trim()).min(1),
  mustPreserve: z.array(z.string().trim()).min(1),
  scenes: z.array(plannerSceneSchema).optional(),
}).passthrough();

export type PlannerOutputSchema = z.infer<typeof plannerOutputSchema> & Partial<PlannerOutput>;
