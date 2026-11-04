/** Public UI identifiers; runtime validation and provider permissions remain server-side. */
export const riotLolActions = [
  { id: "accountByRiotId", label: "Find account by Riot ID", input: "riotId" },
  { id: "accountByPuuid", label: "Get account by PUUID", input: "puuid" },
  { id: "summoner", label: "Get summoner profile", input: "puuid" },
  { id: "currentGame", label: "Get current game", input: "puuid" },
  { id: "matchIds", label: "List match IDs", input: "puuid" },
  { id: "match", label: "Get match", input: "matchId" },
  { id: "timeline", label: "Get match timeline", input: "matchId" },
  { id: "ranked", label: "Get ranked entries", input: "puuid" },
  { id: "masteries", label: "Get champion masteries", input: "puuid" },
  { id: "topMasteries", label: "Get top champion masteries", input: "puuid" },
] as const;
export type RiotLolOperation = (typeof riotLolActions)[number]["id"];

/** TFT deliberately exposes post-game reads, not live scouting or RSO-only APIs. */
export const riotTftActions = [
  { id: "accountByRiotId", label: "Find account by Riot ID" },
  { id: "accountByPuuid", label: "Get account by PUUID" },
  { id: "matchIds", label: "List TFT match IDs" },
  { id: "match", label: "Get TFT match" },
  { id: "ranked", label: "Get TFT ranked entries" },
  { id: "status", label: "Get TFT service status" },
] as const;
export type RiotTftOperation = (typeof riotTftActions)[number]["id"];

export const riotLolPlatforms = [
  ["vn2", "Vietnam"], ["sg2", "Singapore"], ["ph2", "Philippines"], ["th2", "Thailand"], ["tw2", "Taiwan"], ["oc1", "Oceania"],
  ["kr", "Korea"], ["jp1", "Japan"], ["euw1", "Europe West"], ["eun1", "Europe Nordic & East"], ["tr1", "Turkey"], ["ru", "Russia"],
  ["na1", "North America"], ["br1", "Brazil"], ["la1", "Latin America North"], ["la2", "Latin America South"],
] as const;
