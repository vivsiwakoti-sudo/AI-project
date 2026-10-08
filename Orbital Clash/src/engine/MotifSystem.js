export const renderMotif = (ctx, x, y, className) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#00f2ff";
    ctx.lineWidth = 2;
    
    switch(className) {
        case "Ice Sword":
            // Snowflake
            ctx.beginPath();
            for(let i=0; i<6; i++) {
                ctx.moveTo(0, 0); ctx.lineTo(0, -15);
                ctx.rotate(Math.PI / 3);
            }
            ctx.stroke();
            break;
        case "Fireball":
            // Flame
            ctx.fillStyle = "orangered";
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI*2);
            ctx.fill();
            break;
        case "Assassin":
            // Dagger
            ctx.fillStyle = "white";
            ctx.beginPath();
            ctx.moveTo(0, -15); ctx.lineTo(10, 5); ctx.lineTo(-10, 5);
            ctx.fill();
            break;
        case "Spider":
            // Spider with 8 legs
            ctx.strokeStyle = "#00f2ff";
            ctx.lineWidth = 2;
            // Spider body
            ctx.fillStyle = "#333333";
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI*2);
            ctx.fill();
            // 8 legs
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
                ctx.stroke();
            }
            break;
        // ... (etc for others)
        default:
            // Default Circle
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI*2);
            ctx.stroke();
    }
    ctx.restore();
};
