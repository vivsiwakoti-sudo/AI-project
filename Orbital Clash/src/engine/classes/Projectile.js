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
        if (this.x < 0 || this.x > 800 || this.y < 0 || this.y > 800) this.active = false;
    }
    draw(ctx) {
        ctx.fillStyle = "orange";
        ctx.beginPath();
        ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}
