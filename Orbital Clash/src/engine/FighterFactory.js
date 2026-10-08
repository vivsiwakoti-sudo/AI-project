import { FIGHTER_CLASSES } from "./fighterDefinitions.js";
import { FighterBase } from "./classes/FighterBase.js";
import { IceSword } from "./classes/types/IceSword.js";
import { Assassin } from "./classes/types/Assassin.js";
import { Knight } from "./classes/types/Knight.js";
import { Fireball } from "./classes/types/Fireball.js";
import { Ninja } from "./classes/types/Ninja.js";
import { Snake } from "./classes/types/Snake.js";
import { Spearman } from "./classes/types/Spearman.js";
import { Gunner } from "./classes/types/Gunner.js";
import { Samurai } from "./classes/types/Samurai.js";
import { Grappler } from "./classes/types/Grappler.js";
import { MineLayer } from "./classes/types/MineLayer.js";
import { Duplicator } from "./classes/types/Duplicator.js";
import { Ghost } from "./classes/types/Ghost.js";
import { Alchemist } from "./classes/types/Alchemist.js";
import { Mutant } from "./classes/types/Mutant.js";
import { SolarBeam } from "./classes/types/SolarBeam.js";
import { Berserker } from "./classes/types/Berserker.js";
import { Spider } from "./classes/types/Spider.js";
import { Tunneler } from "./classes/types/Tunneler.js";
import { Tornado } from "./classes/types/Tornado.js";
import { Meteor } from "./classes/types/Meteor.js";
import { BlackHole } from "./classes/types/BlackHole.js";
import { Reaper } from "./classes/types/Reaper.js";
import { Vampire } from "./classes/types/Vampire.js";
import { Mahoraga } from "./classes/types/Mahoraga.js";

export class FighterFactory {
  static createFighter(className, x, y) {
    const data = FIGHTER_CLASSES[className];
    if (!data) throw new Error(`Unknown fighter class: ${className}`);
    
    const mapping = {
        "Ice Sword": IceSword, "Assassin": Assassin, "Knight": Knight, "Fireball": Fireball, "Ninja": Ninja,
        "Snake": Snake, "Spearman": Spearman, "Gunner": Gunner, "Samurai": Samurai, "Grappler": Grappler,
        "Mine Layer": MineLayer, "Duplicator": Duplicator, "Ghost": Ghost, "Alchemist": Alchemist, "Mutant": Mutant,
        "Solar Beam": SolarBeam, "Berserker": Berserker, "Spider": Spider, "Tunneler": Tunneler, "Tornado": Tornado,
        "Meteor": Meteor, "Black Hole": BlackHole, "Reaper": Reaper, "Vampire": Vampire, "Mahoraga": Mahoraga
    };
    
    if (mapping[className]) return new mapping[className](data, x, y);
    return new FighterBase(data, x, y);
  }
}
