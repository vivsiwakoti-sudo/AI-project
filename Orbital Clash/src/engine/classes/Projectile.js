export class Projectile {
    constructor(x, y, vx, vy, damage, owner) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.owner = owner;
        this.active = true;
    }
    // A parry hands the shot to the fighter that turned it, so a shot whose owner
    // is no longer its launcher is on its way back to the launcher.
    isReflected(launcher) {
        return this.owner !== launcher;
    }
    // A shot that did not land stays in flight only if a parry turned it back
    // toward its launcher; a shot its target dodged is spent.
    keepsFlying(launcher, target) {
        return this.isReflected(launcher) && !this.dodgedVictims?.has(target);
    }
    update(dt) {
        this.x += this.vx * dt * 100;
        this.y += this.vy * dt * 100;
        const size = this.owner?.arenaSize ?? 800;
        if (this.x < 0 || this.x > size || this.y < 0 || this.y > size) this.active = false;
    }
    draw(ctx) {
        ctx.fillStyle = "orange";
        ctx.beginPath();
        ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}
