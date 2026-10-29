import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import ChampionScreen from "./components/ChampionScreen.jsx";
import { applyMatchResult, buildTournamentBracket, nextPendingMatch, runTournamentMatch } from "./engine/tournament";

let tournament = buildTournamentBracket();
for (let match = nextPendingMatch(tournament); match; match = nextPendingMatch(tournament)) {
  tournament = applyMatchResult(tournament, match, runTournamentMatch(match.first, match.second)).tournament;
}
window.__tournament = tournament;

createRoot(document.getElementById("root")).render(
  <ChampionScreen tournament={tournament} stats={{ classes: {} }} onNewTournament={() => {}} onMainMenu={() => {}} />
);
