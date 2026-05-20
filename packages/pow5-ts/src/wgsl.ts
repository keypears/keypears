import { Pow5_217a as Pow5_217a_Wgsl } from "./pow5-217a-wgsl.ts";
import { Pow5_64b as Pow5_64b_Wgsl } from "./pow5-64b-wgsl.ts";

export {
  targetFromDifficulty,
  difficultyFromTarget,
  hashMeetsTarget,
} from "./difficulty.ts";

export { Pow5_217a_Wgsl, Pow5_64b_Wgsl };
