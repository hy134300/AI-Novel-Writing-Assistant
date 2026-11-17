import type { PromptBudgetProfile } from "@ai-novel/shared/types/chapterRuntime";
import { DEFAULT_MODEL_OUTPUT_TOKENS } from "@ai-novel/shared/types/llm";

export const NOVEL_PROMPT_BUDGETS = {
  directorCandidates: 1200,
  directorCandidatePatch: 1200,
  directorBookContract: 1400,
  creativeCarryoverContract: 1600,
  directorBlueprint: 2400,
  storyMacroDecomposition: 1800,
  storyMacroFieldRegeneration: 1600,
  volumeStrategy: 1800,
  volumeStrategyCritique: 1800,
  volumeSkeleton: 2000,
  volumeBeatSheet: 1600,
  volumeChapterList: 1600,
  volumeChapterDetail: 1600,
  volumeRebalance: 1600,
  chapterWriter: 2600,
  chapterAcceptance: 1200,
  chapterArtifactDelta: 2600,
  chapterEditorWorkspaceDiagnosis: 1400,
  chapterEditorUserIntent: 900,
  chapterEditorRewrite: 1400,
  chapterLightAudit: 900,
  chapterReview: 2600,
  chapterRepair: 2200,
  chapterSummary: 1000,
} as const;

// 思考型模型在流式请求下会先烧掉上千 token 的思考预算，且这部分内容不会出现在
// delta 里（只在 usage.reasoning_tokens 里可见），项目侧的 finish_reason=length
// 判定就会误报「token 上限不足」。实测 gemini-4-hydrogen-sonar 单次思考 1300-5500，
// 而且流式下无法通过 reasoning_effort / thinking 参数关闭，只能用预算兜住。
const VOLUME_STRATEGY_OUTPUT_TOKEN_FLOOR = 6_000;
const VOLUME_STRATEGY_OUTPUT_TOKENS_PER_VOLUME = 320;
const VOLUME_STRATEGY_OUTPUT_TOKEN_CEILING = 12_000;

export function resolveVolumeStrategyOutputTokenBudget(expectedVolumeCount: number): number {
  const normalizedVolumeCount = Number.isFinite(expectedVolumeCount)
    ? Math.max(1, Math.round(expectedVolumeCount))
    : 1;
  return Math.min(
    VOLUME_STRATEGY_OUTPUT_TOKEN_CEILING,
    Math.max(
      VOLUME_STRATEGY_OUTPUT_TOKEN_FLOOR,
      1_200 + normalizedVolumeCount * VOLUME_STRATEGY_OUTPUT_TOKENS_PER_VOLUME,
    ),
  );
}

const DIRECTOR_CANDIDATES_OUTPUT_TOKEN_FLOOR = DEFAULT_MODEL_OUTPUT_TOKENS;
const DIRECTOR_CANDIDATES_OUTPUT_TOKENS_PER_CANDIDATE = 4_096;
const DIRECTOR_CANDIDATES_OUTPUT_TOKEN_CEILING = 32_768;

// Book-level candidate batches carry several full direction drafts. The floor
// scales with the requested candidate count so a larger batch never runs on
// the same budget as a single direction.
export function resolveDirectorCandidatesOutputTokenBudget(candidateCount: number): number {
  const normalizedCount = Number.isFinite(candidateCount)
    ? Math.max(1, Math.round(candidateCount))
    : 1;
  return Math.min(
    DIRECTOR_CANDIDATES_OUTPUT_TOKEN_CEILING,
    Math.max(
      DIRECTOR_CANDIDATES_OUTPUT_TOKEN_FLOOR,
      normalizedCount * DIRECTOR_CANDIDATES_OUTPUT_TOKENS_PER_CANDIDATE,
    ),
  );
}

export const RUNTIME_PROMPT_BUDGET_PROFILES: PromptBudgetProfile[] = [
  {
    promptId: "novel.chapter.writer",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterWriter,
    preferredGroups: [
      "chapter_boundary",
      "chapter_mission",
      "previous_chapter_tail",
      "reader_experience",
      "character_hard_facts",
      "payoff_directives",
      "style_contract",
      "volume_window",
      "participant_subset",
      "local_state",
      "open_conflicts",
      "recent_chapters",
    ],
    dropOrder: [
      "rag_facts",
      "world_rules",
      "continuation_constraints",
      "opening_constraints",
    ],
  },
  {
    promptId: "novel.chapter.acceptance_assessment",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterAcceptance,
    preferredGroups: [
      "chapter_mission",
      "structure_obligations",
      "character_hard_facts",
      "local_state",
      "style_contract",
      "open_conflicts",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "world_rules",
      "historical_issues",
    ],
  },
  {
    promptId: "novel.chapter.artifact_delta.extract",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterArtifactDelta,
    preferredGroups: [
      "chapter_mission",
      "local_state",
      "character_hard_facts",
      "payoff_directives",
      "open_conflicts",
    ],
    dropOrder: [
      "recent_chapters",
      "world_rules",
      "historical_issues",
      "participant_subset",
    ],
  },
  {
    promptId: "audit.chapter.light",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterLightAudit,
    preferredGroups: [
      "chapter_mission",
      "structure_obligations",
      "character_hard_facts",
      "local_state",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "historical_issues",
      "world_rules",
    ],
  },
  {
    promptId: "audit.chapter.full",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterReview,
    preferredGroups: [
      "chapter_mission",
      "structure_obligations",
      "character_hard_facts",
      "world_rules",
      "historical_issues",
    ],
    dropOrder: [
      "rag_facts",
      "recent_chapters",
      "participant_subset",
    ],
  },
  {
    promptId: "novel.review.repair",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterRepair,
    preferredGroups: [
      "style_contract",
      "repair_issues",
      "chapter_mission",
      "previous_chapter_tail",
      "repair_boundaries",
      "character_hard_facts",
      "world_rules",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "continuation_constraints",
    ],
  },
];
