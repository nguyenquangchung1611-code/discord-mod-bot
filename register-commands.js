import "dotenv/config";
import { registerCommands } from "./commands.js";

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("Need DISCORD_TOKEN and CLIENT_ID in .env");
  process.exit(1);
}

const where = await registerCommands({ token: DISCORD_TOKEN, clientId: CLIENT_ID, guildId: GUILD_ID });
console.log(`Registered /rules and /strikes ${where}.`);
