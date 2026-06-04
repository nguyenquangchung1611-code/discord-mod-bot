import { REST, Routes, SlashCommandBuilder } from "discord.js";

const rules = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Manage content-moderation rules")
  .addSubcommand((s) => s.setName("list").setDescription("List all rules"))
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add a rule (or a pattern to an existing rule id)")
      .addStringOption((o) => o.setName("id").setDescription("Rule id").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Match type")
          .setRequired(true)
          .addChoices({ name: "keyword", value: "keyword" }, { name: "regex", value: "regex" })
      )
      .addStringOption((o) => o.setName("pattern").setDescription("Word or regex to match").setRequired(true))
      .addStringOption((o) => o.setName("description").setDescription("Human-readable description"))
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove a rule by id")
      .addStringOption((o) => o.setName("id").setDescription("Rule id").setRequired(true))
  )
  .addSubcommand((s) => s.setName("reload").setDescription("Reload rules from the file on disk"));

const strikes = new SlashCommandBuilder()
  .setName("strikes")
  .setDescription("View or reset a user's strike count")
  .addSubcommand((s) =>
    s
      .setName("check")
      .setDescription("Show a user's active strike count")
      .addUserOption((o) => o.setName("user").setDescription("Member to check").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("clear")
      .setDescription("Reset a user's strikes to zero")
      .addUserOption((o) => o.setName("user").setDescription("Member to clear").setRequired(true))
  );

export const commandsJSON = [rules.toJSON(), strikes.toJSON()];

// Register the commands with Discord. Guild-scoped registration (GUILD_ID set)
// updates instantly; global registration can take up to ~1 hour to appear.
export async function registerCommands({ token, clientId, guildId }) {
  const rest = new REST({ version: "10" }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  await rest.put(route, { body: commandsJSON });
  return guildId ? `guild ${guildId}` : "globally";
}
