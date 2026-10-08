const express = require("express");
const cors = require("cors");
const mammoth = require("mammoth");
const path = require("path");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

let softwarePlan = "";

async function loadSoftwarePlan() {
    try {
        const documentPath = path.join(
            __dirname,
            "..",
            "Software Planning (1).docx"
        );

        const result = await mammoth.extractRawText({
            path: documentPath
        });

        softwarePlan = result.value;

        console.log("=================================");
        console.log("Software Planning document loaded!");
        console.log("Characters read:", softwarePlan.length);
        console.log("=================================");
    } catch (error) {
        console.error("Could not read Software Planning document:");
        console.error(error.message);
    }
}

app.get("/", (req, res) => {
    res.json({
        message: "AI Game Backend is running!"
    });
});

app.get("/api/software-plan", (req, res) => {
    res.json({
        success: true,
        plan: softwarePlan
    });
});

loadSoftwarePlan().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});