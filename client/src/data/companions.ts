// Central companion registry — the single source of truth for companion
// artwork, display metadata, and the level at which each one joins the
// roster. Every companion shares the SAME account-level evolution stage
// (see server/lib/gamification.ts STAGES), so unlocking a new companion at
// a higher level means it joins you already partway evolved — a deliberate
// design choice that ties new-companion moments to the same stage-up
// milestones instead of tracking a second, separate progression system.

import mossbackStage1 from "@/assets/companions/mossback/stage1.png";
import mossbackStage1Blink from "@/assets/companions/mossback/stage1_blink.png";
import mossbackStage2 from "@/assets/companions/mossback/stage2.png";
import mossbackStage2Blink from "@/assets/companions/mossback/stage2_blink.png";
import mossbackStage3 from "@/assets/companions/mossback/stage3.png";
import mossbackStage3Blink from "@/assets/companions/mossback/stage3_blink.png";
import mossbackStage4 from "@/assets/companions/mossback/stage4.png";
import mossbackStage4Blink from "@/assets/companions/mossback/stage4_blink.png";
import mossbackStage5 from "@/assets/companions/mossback/stage5.png";
import mossbackStage5Blink from "@/assets/companions/mossback/stage5_blink.png";

import riptideStage1 from "@/assets/companions/riptide/stage1.png";
import riptideStage1Blink from "@/assets/companions/riptide/stage1_blink.png";
import riptideStage2 from "@/assets/companions/riptide/stage2.png";
import riptideStage2Blink from "@/assets/companions/riptide/stage2_blink.png";
import riptideStage3 from "@/assets/companions/riptide/stage3.png";
import riptideStage3Blink from "@/assets/companions/riptide/stage3_blink.png";
import riptideStage4 from "@/assets/companions/riptide/stage4.png";
import riptideStage4Blink from "@/assets/companions/riptide/stage4_blink.png";
import riptideStage5 from "@/assets/companions/riptide/stage5.png";
import riptideStage5Blink from "@/assets/companions/riptide/stage5_blink.png";

import chompStage1 from "@/assets/companions/chomp/stage1.png";
import chompStage1Blink from "@/assets/companions/chomp/stage1_blink.png";
import chompStage2 from "@/assets/companions/chomp/stage2.png";
import chompStage2Blink from "@/assets/companions/chomp/stage2_blink.png";
import chompStage3 from "@/assets/companions/chomp/stage3.png";
import chompStage3Blink from "@/assets/companions/chomp/stage3_blink.png";
import chompStage4 from "@/assets/companions/chomp/stage4.png";
import chompStage4Blink from "@/assets/companions/chomp/stage4_blink.png";
import chompStage5 from "@/assets/companions/chomp/stage5.png";
import chompStage5Blink from "@/assets/companions/chomp/stage5_blink.png";

import noodleStage1 from "@/assets/companions/noodle/stage1.png";
import noodleStage1Blink from "@/assets/companions/noodle/stage1_blink.png";
import noodleStage2 from "@/assets/companions/noodle/stage2.png";
import noodleStage2Blink from "@/assets/companions/noodle/stage2_blink.png";
import noodleStage3 from "@/assets/companions/noodle/stage3.png";
import noodleStage3Blink from "@/assets/companions/noodle/stage3_blink.png";
import noodleStage4 from "@/assets/companions/noodle/stage4.png";
import noodleStage4Blink from "@/assets/companions/noodle/stage4_blink.png";
import noodleStage5 from "@/assets/companions/noodle/stage5.png";
import noodleStage5Blink from "@/assets/companions/noodle/stage5_blink.png";

import stretchStage1 from "@/assets/companions/stretch/stage1.png";
import stretchStage1Blink from "@/assets/companions/stretch/stage1_blink.png";
import stretchStage2 from "@/assets/companions/stretch/stage2.png";
import stretchStage2Blink from "@/assets/companions/stretch/stage2_blink.png";
import stretchStage3 from "@/assets/companions/stretch/stage3.png";
import stretchStage3Blink from "@/assets/companions/stretch/stage3_blink.png";
import stretchStage4 from "@/assets/companions/stretch/stage4.png";
import stretchStage4Blink from "@/assets/companions/stretch/stage4_blink.png";
import stretchStage5 from "@/assets/companions/stretch/stage5.png";
import stretchStage5Blink from "@/assets/companions/stretch/stage5_blink.png";

export type CompanionId = "mossback" | "riptide" | "chomp" | "noodle" | "stretch";

export interface CompanionDef {
  id: CompanionId;
  name: string;
  species: string;
  tagline: string;
  /** Player level at which this companion joins the roster. */
  unlockLevel: number;
  accent: string; // tailwind-ish accent token used for badges/rings
  images: Record<number, string>;
  blinkImages: Record<number, string>;
}

export const COMPANION_REGISTRY: Record<CompanionId, CompanionDef> = {
  mossback: {
    id: "mossback",
    name: "Mossback",
    species: "Dinosaur",
    tagline: "Your original companion — with you from day one.",
    unlockLevel: 1,
    accent: "emerald",
    images: { 1: mossbackStage1, 2: mossbackStage2, 3: mossbackStage3, 4: mossbackStage4, 5: mossbackStage5 },
    blinkImages: {
      1: mossbackStage1Blink,
      2: mossbackStage2Blink,
      3: mossbackStage3Blink,
      4: mossbackStage4Blink,
      5: mossbackStage5Blink,
    },
  },
  riptide: {
    id: "riptide",
    name: "Riptide",
    species: "Mosasaurus",
    tagline: "A sharp-toothed sea hunter that joins once you find your rhythm.",
    unlockLevel: 4,
    accent: "teal",
    images: { 1: riptideStage1, 2: riptideStage2, 3: riptideStage3, 4: riptideStage4, 5: riptideStage5 },
    blinkImages: {
      1: riptideStage1Blink,
      2: riptideStage2Blink,
      3: riptideStage3Blink,
      4: riptideStage4Blink,
      5: riptideStage5Blink,
    },
  },
  chomp: {
    id: "chomp",
    name: "Chomp",
    species: "Liopleurodon",
    tagline: "A big-headed, big-hearted marine reptile with an even bigger bite.",
    unlockLevel: 7,
    accent: "slate",
    images: { 1: chompStage1, 2: chompStage2, 3: chompStage3, 4: chompStage4, 5: chompStage5 },
    blinkImages: {
      1: chompStage1Blink,
      2: chompStage2Blink,
      3: chompStage3Blink,
      4: chompStage4Blink,
      5: chompStage5Blink,
    },
  },
  noodle: {
    id: "noodle",
    name: "Noodle",
    species: "Elasmosaurus",
    tagline: "A graceful long-necked companion who shows up once you've built momentum.",
    unlockLevel: 11,
    accent: "violet",
    images: { 1: noodleStage1, 2: noodleStage2, 3: noodleStage3, 4: noodleStage4, 5: noodleStage5 },
    blinkImages: {
      1: noodleStage1Blink,
      2: noodleStage2Blink,
      3: noodleStage3Blink,
      4: noodleStage4Blink,
      5: noodleStage5Blink,
    },
  },
  stretch: {
    id: "stretch",
    name: "Stretch",
    species: "Albertonectes",
    tagline: "The longest-necked of them all — a legendary-tier companion for legendary-tier effort.",
    unlockLevel: 16,
    accent: "cyan",
    images: { 1: stretchStage1, 2: stretchStage2, 3: stretchStage3, 4: stretchStage4, 5: stretchStage5 },
    blinkImages: {
      1: stretchStage1Blink,
      2: stretchStage2Blink,
      3: stretchStage3Blink,
      4: stretchStage4Blink,
      5: stretchStage5Blink,
    },
  },
};

/** Ordered by unlock level, ascending — matches how the level path renders. */
export const COMPANION_ORDER: CompanionId[] = ["mossback", "riptide", "chomp", "noodle", "stretch"];

export const STAGE_NAMES: Record<number, string> = {
  1: "Hatchling",
  2: "Sprout",
  3: "Adventurer",
  4: "Guardian",
  5: "Legendary",
};

export const STAGE_LEVEL_RANGES: Record<number, string> = {
  1: "Lv. 1–3",
  2: "Lv. 4–6",
  3: "Lv. 7–10",
  4: "Lv. 11–15",
  5: "Lv. 16+",
};

export function isCompanionId(value: string): value is CompanionId {
  return value in COMPANION_REGISTRY;
}
