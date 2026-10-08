# Software Design 8/10/26

## Game Description

* \- A simulation game about circles that bounce off the walls of a box. Each circle has different abilities and looks to defeat the other. Whoever wins gets a \+1 on their win record. The player starts on a menu with all currently available classes to pick from, and hovering over them shows their stats. Right-clicking allows the player to see a description of the fighter. The player can sort each class by the following stats.  
  *   \- Win/loss ratio  
  *   \- Total wins  
  *   \- Least wins  
  *   \- Most appearances  
  *   \- Win percentage  
  *    \-Class
cd frontend
npm run dev
cd backend
node index.js


    ## Gameplay

* \- Continue: The player now picks two circles (fighters) and presses the start button, which can only be clicked after two classes are selected. Then the circles start on two sides of the square, which is 800 x 800, where each fighter starts with its center 200 pixels inward from the arena border on the left and right, and the border is 4 pixels wide. The fighters start by going diagonally in opposite directions. For example, if one circle is on the right side, you would go at a random angle from 20-45 degrees down to the left, and the one on the left will go 20-45 degrees up to the right.


* Purpose: STIMULATION MACHINE, constant battles, and analyzing these could very much take up your empty time

  ## Menu

* .- The menu will have the start button at the bottom, but greyed out until fighters are selected. It is in a black and blue arcade-style decoration. In the middle of the screen will be all currently available classes with a box with their name, a certain color for them, and a style for each class, e.g., Ice Sword class; the box is light blue with blue snowflakes on it. When a class is selected, the colors will invert to their polar opposite. You cannot select more than 2 classes at once until further updates.


* \- Visual status effects use consistent, readable indicators where possible (for example, Ice Sword turns the opponent blue while slowed, and Solar Beam visibly charges before firing).

  ## End Screen

* \- After a battle ends, it shows the winner jumping up and down on a line, and below will be a battle summary saying the following  
  *   \- Fight lasted \_\_ seconds  
  *   \- Total damage done: \_\_  
  *   \- Damage done by X class: \_\_  
  *   \- Damage done by Y class: \_\_  
  *   \- Stats for each class  
    *     \- Winner Class:  
    *       \- 15 wins \+1  
    *       \- 5 losses  
    *       \- Win Percentage 75%  
    *       \- 20 Appearances \+1  
    *     \- Loser Class:  
    *       \- 5 wins  
    *       \- 5 losses \+1  
    *       \- Win Percentage 50%  
    *       \- 10 Appearances \+1

      

* \- Win Percentage is calculated as: Wins ÷ Appearances × 100\.  
* \- Appearances are calculated as Wins \+ Losses.   
* \- It follows up with a return to the menu button at the bottom of the screen.  
* \- When circles collide, they bounce off each other as they would against the wall and are pushed apart. During the fight, both fighters have live stats shown in 500x800 pixel pop-ups on the sides of the screen outside the arena.

  ## 	Death

* \- When the HP of one fighter is 0 or below, it explodes into pixels of its respective color, and 2 seconds after the death of one, the end screen appears.


#  Universal Combat Rules

* Fighters collide with walls the same way they collide with the arena border.  
* Upon colliding with each other, the fighters will bounce off each other. A collision will not damage until that attack is said to do damage through collision.  
* The Body Size of a fighter is the physical collision volume that it occupies in the game. Attack hitboxes differ for weapons, projectiles, trails, and fields.  
* The center of a fighter is where they are spawned 200 pixels inward from the left or right.  
* The attacks are separated into these categories:  
  * Body: Damage inflicted when the character itself makes contact with the body of an opponent.  
  * Melee: a weapon or physical extension directly connected to the fighter, like a sword/scythe.  
  * Projectile: an autonomous object which moves throughout the arena.  
  * Beam: an attack that strikes the target with a line but doesn't act like a typical projectile.  
  * AOE: damage or effects on a specified area of the arena.  
* \- Cooldowns normally begin when an ability is activated. A class may explicitly state a different cooldown rule in the description provided.  
* \- DOT effects use independent timers. They do not merge, stack, or refresh unless the class description explicitly says they do.  
* \- Effects are either stacking, refreshing/non-stacking, or independent, as specified by the class. Ice Sword's slowness is refreshing and non-stacking.  
* \- The game is frame/time based; all durations use seconds, frames, or successful hits.   
* \- The characters usually don’t have AI unless said so in the description.  
* \- Normal battles have a duration of  5 minutes. If neither fighter has won by then, Sudden Death begins: both fighters lose 3% of their health per second until one is defeated.  
* \- Uncapped scaling buffs may use a maximum safe value to prevent a character from becoming too powerful in a short period of time, while the displayed stat may use shortened notation for very large numbers.


  # Gameplay Mechs/Characters


* **\- Ice Sword**: Has an icy sword rotating around them as they go around the arena, and when it touches the opponent, it does 10 damage and slows them down by 50% (doesn't stack). They turn blue for 2 seconds to represent the slowness, and if hit again before the time ends, it resets.  
  *   \- Health: 100  
  *   \- Damage: 10  
  *   \- Effect: Slowness  
  *   \- Speed: 5 px per frame  
  *   \- Attack Type: Rotating blade  
  *   \- Body Size: 40x40  
  *   \- Attack Reach: 20 pixels beyond the body

    

* **\- Fireball:** Shoots fireballs which travel at 6 px per frame, but the twist is that at first it shoots one fireball, on the next attack it shoots two, and it goes on and on. Each fireball does 5 tick damage (1 per 3 frames), and it stacks by adding to the total damage and not the rate. Each fireball creates its own independent burn timer; multiple fireballs stack by adding additional damage sources rather than increasing the tick rate of one fireball.  
  *   \- Health: 100  
  *   \- Damage: 5  
  *   \- Effect: Stacking Burn  
  *   \- Speed: 5 px per frame  
  *   \- Cooldown: 3 seconds  
  *   \- Attack Type: Fireballs  
  *   \- Body Size: 40x40

    

* **\- Duplicator:** Upon touching the opponent, it does 2 damage, but adds a clone with 25% less HP, and if the original fighter is killed, they all die. The clone limit is 50; the HP goes down for every generation of clones.  
  *   \- Health: 75  
  *   \- Damage: 2  
  *   \- Effect: Exponential Growth  
  *   \- Speed: 5 px per frame  
  *   \- Cooldown: N/A  
  *   \- Attack Type: Body  
  *   \- Body Size: 40x40

    

* **\- Ghost:** A slightly transparent character. When it activates its ghost mode after 5 seconds, in this mode, it cannot be hit and zips around faster at 7 px per frame. If it touches the opponent in this mode, it does 8 damage, and the effect lasts for 5 seconds.  
  *   \- Health: 80  
  *   \- Damage: 8  
  *   \- Effect: Invincibility, Speed  
  *   \- Speed: 5 px/frame to 7 px/frame  
  *   \- Cooldown: 5 seconds  
  *   \- Attack Type: Body  
  *   \- Body Size: 40x40

    

* **\- Alchemist**: Throws a potion that gives different effects like: Slowness (5 dam), Poison (10 dam), Stun (7 dam), percentage damage (10-25% of current hp), and vampiric drain (8 dam \+5 hp).  
  *   \- Health: 90  
  *   \- Damage: 5 \- 25% of hp  
  *   \- Effect: Slowness, Poison, Stun, Percentage damage, life steal  
  *   \- Cooldown: 5 seconds  
  *   \- Attack Type: Potions  
  *   \- Speed: 5 px/frame  
  *   \- Body Size: 40x40

    

* **\- Assassin**: A small, nimble fighter with deadly precision. Most of the time, it will bounce off the wall and try to go closer to the opponent. It does 5 damage normally but has a 25% chance to land a critical hit, doing 15 damage instead.  
  *   \- Health: 50  
  *   \- Damage: 5-15  
  *   \- Effect: Critical hits  
  *   \- Speed: 8 px/frame  
  *   \- Body Size: 32x32  
  *   \- Attack Type: Dagger  
  *   \- Cooldown: N/A  
  *   \- Has an AI that makes its angle towards the opponent more often

    

* **\- Mutant**: Starts with basic stats, 100 hp, 10 damage, etc., but changes randomly every 5 seconds. HP ranges from 10-250, damage ranges from 10-100, and speed is always 5 px/frame. It has arms that grow or shrink to show how much damage it does, and the arms are always on the edge of its body. The body grows and shrinks depending on HP. It doesn't automatically heal you. For example, you have 5/10 HP left, but you mutate, and now your max health is 200\. Since 5 is 50% of 10, you will have 50% of your max health, so 100\.  
  *   \- Health: 10-250  
  *   \- Damage: 10-100  
  *   \- Effect: Random Mutation  
  *   \- Cooldown: 7 seconds  
  *   \- Speed: 5 px/frame  
  *   \- Attack Type: Body  
  *   \- Body Size: 32x32-64x64

    

* **\- Knight:** The knight has a sword and shield. When he approaches the opponent, he swings his sword, doing 15 damage, and if the opponent attacks with a melee or projectile, there is a 25% chance that he uses his shield to block it, and the shield stays to block for 2 more seconds.  
  *   \- Health: 150  
  *   \- Damage: 15  
  *   \- Effect: Blocking  
  *   \- Cooldown: 3/4 second between slashes  
  *   \- Attack Type: Sword  
  *   \- Speed: 3 px/frame  
  *   \- Body Size: 56x56

    

* **\- Solar Beam**: Charges up a yellow laser that blasts itself at the enemy, doing 25 damage. Every time it hits, it lowers the cooldown of the beam. There is a continuous glow increasing in size until the beam is released.  
  *   \- Health: 75  
  *   \- Damage: 25  
  *   \- Effect: Lowering Cooldown  
  *   \- Attack Type: Beam  
  *   \- Speed: 5 px/frame  
  *   \- Body Size: 40x40  
  *   \- Cooldown: 7 seconds, but lowers by 10% every time it hits, minimum 2 seconds

    

* **\- Berserker:** The Berserker has 2 rotating blades around it that both do 8 damage, and every time either blade hits the enemy, the blades spin 10% faster. This stacks multiplicatively until the game ends.  
  *   \- Health: 150  
  *   \- Damage: 8  
  *   \- Effect: Increase speed of attack  
  *   \- Attack Type: Rotating blade  
  *   \- Speed: 5 px/frame  
  *   \- Body Size: 40x40  
  *   \- Cooldown: N/A

    

* **\- Spider**: This class lays webs around the map with a 4-second cooldown, slows the person inside of it by 60%, and does 5 damage every 1.5 seconds.  
  *   \- Health: 85  
  *   \- Damage: 5  
  *   \- Effect: Sticky web  
  *   \- Speed: 5 px/frame  
  *   \- Attack Type: Web projectile  
  *   \- Cooldown: 4 seconds  
  *   \- Body Size: 36x36

    

* **\- Tunneler:** This class has a 40% chance that when it hits the wall, it will tunnel through away from danger, preventing ranged fighters from automatically firing new targeted attacks until it reappears 3 seconds later from a random position on the edge of the wall. When it comes out of the wall, it shoots five spikes from the wall out in the direction it's facing.  
  *   \- Health: 60  
  *   \- Damage: 7  
  *   \- Effect: Tunneling  
  *   \- Speed: 5 px/frame  
  *   \- Attack Type: Spikes  
  *   \- Cooldown: N/A  
  *   \- Body Size: 40x40

    

* **\- Tornado:** This class sends a burst of wind in all directions, but only in a small area around the fighter.  
  *   \- Health: 100  
  *   \- Damage: 10  
  *   \- Effect: AOE damage  
  *   \- Speed: 6 px/frame  
  *   \- Attack Type: Wind AOE  
  *   \- Cooldown: 4 seconds  
  *   \- Body Size: 48x48

    

* **\- Meteor**: Every 10 seconds, one quarter of the arena is randomly selected and highlighted red. After 3 seconds of blinking red as a warning, a meteor strikes that quarter and deals 50 damage to fighters inside it.  
  *   \- Health: 100  
  *   \- Damage: 50  
  *   \- Effect: AOE  
  *   \- Speed: 5 px/frame  
  *   \- Attack Type: Nuke  
  *   \- Cooldown: 10 seconds  
  *   \- Body Size: 40x.40

    

* **\- Black Hole**: Shoots a black laser near the opponent, and it creates a black hole that sucks them in and does 15 damage (3 ticks of \-5), and is a circle with a radius of 100 pixels.  
  *   \- Health: 100  
  *   \- Damage: 15  
  *   \- Effect: Suction  
  *   \- Speed: 5 px/frame  
  *   \- Attack Type: Black Hole  
  *   \- Cooldown: 7 seconds  
  *   \- Body Size: 40x40

    

* **\- Reaper**: Every time the Reaper's long scythe hits an enemy, its damage increases with no cap, multiplying its current damage by 1.5 after each successful hit. The scythe extends 20 pixels beyond the body.  
  *   \- Health: 100  
  *   \- Damage: 5 \- Unlimited  
  *   \- Effect: Damage increase  
  *   \- Speed: 5 px/frame  
  *   \- Attack Type: Scythe  
  *   \- Cooldown: N/A  
  *   \- Body Size: 40x40  
  *   \- Attack Reach: 20 pixels beyond the body

    

* **\- Vampire**: When attacking, it does 8 damage but heals 5 HP. When it heals 3 times, it evolves and increases its speed by 2 px/frame and damage by 2, with a cap. It also gains wings on the 1st evolution, giving it a 25% chance to dodge upon getting attacked by melee or ranged.  
  *   \- Health: 85  
  *   \- Damage: 8-16  
  *   \- Effect: Life steal and Buffs  
  *   \- Speed: 5 px/frame \- 13 px/frame  
  *   \- Attack Type: Stake  
  *   \- Cooldown: N/A  
  *   \- Body Size: 38x38

    

* **\- Mahoraga**: A larger fighter that adapts to attack categories after being hit 3 times by attacks of that category. When Melee attacks (with weapons) have been adapted to, it gets 30% resistance to them and a 25% chance to parry and stun the attack. Projectile attacks get 50% resistance. Body attacks get 75% resistance after the required adaptation is completed. It attacks with fists attached to its body.  
  *   \- Health: 130  
  *   \- Damage: 8  
  *   \- Effect: Adaptation  
  *   \- Speed: 4 px/frame  
  *   \- Attack Type: Fists  
  *   \- Cooldown: N/A  
  *   \- Body Size: 46x46

    

* **\- Snake:** Leaves a poisonous trail behind itself that slows and damages the opponent. It slows by 50% and does 6 damage per second, and older parts of the trail go away after 15 seconds. The circle also has a little trail for visual purposes.  
  *   \- Health: 100  
  *   \- Damage: 6  
  *   \- Effect: Lingering poison  
  *   \- Speed: 4 px/frame  
  *   \- Attack Type: Trail  
  *   \- Cooldown: N/A  
  *   \- Body Size: 42x42

    

* **\- Ninja**: Has a rope dart that pulls the enemy in after doing 11 damage and then punches them away for 4 additional damage (the punch only happens when the rope dart hits). It has a 33% chance that upon impact, it does a random effect: fire (5 damage), electric (jittering movements \+3 damage), maximum HP reduction (20%). The rope dart has a maximum reach of 300 pixels.  
  *   \- Health: 90  
  *   \- Damage: 11 \+ 4 \= 15 normal  
  *   \- Effect: Pulling in and random effects  
  *   \- Speed: 6 px/frame  
  *   \- Attack Type: Rope-dart  
  *   \- Cooldown: 6 seconds  
  *   \- Body Size: 38x38

    

* **Spearman:** Every couple of seconds, he throws a spear; when he hits an enemy, it goes through them and takes them to the wall and keeps them there for 2-4 seconds, and for each of those seconds they take 3 damage; the base damage is 5\. When the spear misses, it still goes to the wall and stays for 2-4 seconds, and if the enemy touches it will act like a wall and make them bounce away and do 3 damage.  
  * Health: 100  
  * Damage: 11-17  
  * Effect: Impaling, stun  
  * Speed: 5 ppf  
  * Attack type: Spear  
  * CD: 5 seconds  
  * Body Size: 40x40

    

* **Gunner:** When it shoots its has 4 different combos: Weak and inaccurate bullets, Strong and inaccurate bullets, Weak and Accurate bullets, and Strong and accurate bullets. The first two are 40% chance occurrences, while the next one (Weak and accurate) has a 15% chance, and the final one has a 5% chance, always sprays 4 bullets.  
  * Health: 80  
  * Damage: 3-6  
  * Effect: Spray  
  * Attack type: Bullet  
  * Speed: 5 px/f  
  * CD: 2-8, charges up on the stronger attacks  
  * Body size: 44x44

    

* **Samurai:** When within 10 px of the enemy goes around their current location with 3 consecutive slashes, doing 6 damage each with a 3-second gap to avoid spam. If the last one hits, the samurai goes invisible for 5 seconds and has a 25% critical hit chance for 1.5x damage; normally, it is only 5%  
  * Health: 110  
  * Damage: 6 normal, 9 critical  
  * Effect: Invisibility, crit chance  
  * Attack type: sword  
  * Speed: 4 px/f  
  * CD: 3-second gap between combos  
  * Body size: 44x44

    

* **Grappler:** Spins a hook around itself for 3 seconds; the hook extends out 100 px, but if the enemy is caught, it will latch on and spin them around, doing 5 damage. When they are released after 2 seconds, their momentum increases by 100% (current velocity 2x), and for every wall they hit within 2.5 seconds of being released, they take 2 bonus damage.  
  * Health: 100  
  * Damage: 5  
  * Effect: Momentum, bonus damage  
  * Attack type: Hook  
  * Speed: 5px/f  
  * CD: 4 seconds  
  * Body size: 40x40

    

* **Mine Layer:** Lays mines around the arena that explode when touched and do 10 damage in an area. Mines last for 25 seconds, are immune to their own mines, explosion size is 20 pixels.  
  * Health: 70  
  * Damage: 10  
  * Effect: AOE explosion  
  * Attack type: Bombs  
  * Speed: px/f  
  * CD: 5 seconds between each mine  
  * Body size: 40x40

    

    Add these classes the same way you did the others