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
