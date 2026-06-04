import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { loadRules, saveRules, checkContent } from "./moderation.js";
import {
  loadStrikes,
  recordStrike,
  timeoutMinutesForStrike,
  clearStrikes,
  getStrikeCount,
} from "./strikes.js";
import { registerCommands } from "./commands.js";

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in .env");
  process.exit(1);
}

// Discord caps timeouts at 28 days.
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;

// "90" -> "1h 30m", "1440" -> "1d", etc.
function formatDuration(minutes) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "0m";
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Rules are loaded once and kept in memory; slash commands and /reload refresh this.
let rulesData = await loadRules();
// Per-user strike history persists across restarts.
await loadStrikes();

// Sensible fallbacks if the escalation block is missing from rules.json.
function escalationConfig() {
  const e = rulesData.settings.escalation ?? {};
  return {
    ladder: e.timeoutMinutesLadder?.length ? e.timeoutMinutesLadder : [60, 360, 1440],
    resetDays: e.strikeResetDays ?? 30,
  };
}

function isExempt(member, settings) {
  if (!member) return false;
  if (settings.exemptUserIds?.includes(member.id)) return true;
  return member.roles.cache.some((r) => settings.exemptRoleIds?.includes(r.id));
}

async function logAction(guild, embed) {
  const channelId = rulesData.settings.logChannelId;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (channel?.isTextBased()) {
    channel.send({ embeds: [embed] }).catch(() => {});
  }
}

async function handleMessage(message) {
  // Ignore bots, DMs, and our own messages.
  if (message.author.bot || !message.guild) return;

  const member = message.member;
  if (isExempt(member, rulesData.settings)) return;

  const rule = checkContent(message.content, rulesData);
  if (!rule) return;

  // Escalate based on how many strikes this user has within the active window.
  const { ladder, resetDays } = escalationConfig();
  const strikes = recordStrike(message.guild.id, message.author.id, resetDays);
  const minutes = Math.min(timeoutMinutesForStrike(strikes, ladder), MAX_TIMEOUT_MINUTES);
  const reason = `Rule "${rule.id}": ${rule.description} (strike #${strikes})`;

  // Apply the timeout. Requires the bot's role to be above the target's.
  let timedOut = false;
  if (member?.moderatable) {
    try {
      await member.timeout(minutes * 60 * 1000, reason);
      timedOut = true;
    } catch (err) {
      console.warn(`Could not timeout ${member.user.tag}:`, err.message);
    }
  }

  // Private notice: DM the offending user so the warning is not shown publicly.
  let dmFailed = false;
  if (rulesData.settings.dmUserOnViolation) {
    const where = message.guild.name;
    const notice = timedOut
      ? `🔇 You were timed out in **${where}** for **${formatDuration(minutes)}** for breaking **${rule.id}** (${rule.description}). This is strike #${strikes}.`
      : `⚠️ Your message in **${where}** broke **${rule.id}** (${rule.description}). This is strike #${strikes}.`;
    // DMs fail if the user blocks them or shares no mutual server setting.
    await message.author.send(notice).catch(() => {
      dmFailed = true;
    });
  }

  // Delete the offending message (best effort).
  if (rulesData.settings.deleteViolatingMessage) {
    message.delete().catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(timedOut ? 0xed4245 : 0xfaa61a)
    .setTitle("Content rule triggered")
    .addFields(
      { name: "User", value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: "Rule", value: rule.id, inline: true },
      { name: "Strike", value: `#${strikes}`, inline: true },
      { name: "Action", value: timedOut ? `Timed out ${formatDuration(minutes)}` : "Timeout failed (check role order)", inline: true },
      { name: "DM", value: !rulesData.settings.dmUserOnViolation ? "off" : dmFailed ? "could not DM" : "sent", inline: true },
      { name: "Channel", value: `<#${message.channelId}>`, inline: true },
      { name: "Message", value: message.content.slice(0, 1000) || "(empty)" }
    )
    .setTimestamp();

  await logAction(message.guild, embed);
}

client.on(Events.MessageCreate, handleMessage);
// Re-scan edited messages so people can't sneak a violation in via edit.
client.on(Events.MessageUpdate, (_old, updated) => {
  if (updated.partial) updated.fetch().then(handleMessage).catch(() => {});
  else handleMessage(updated);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!["rules", "strikes"].includes(interaction.commandName)) return;

  // Only members who can moderate (timeout) others may use these commands.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    return interaction.reply({ content: "You need the Moderate Members permission.", ephemeral: true });
  }

  if (interaction.commandName === "strikes") {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user", true);
    if (sub === "check") {
      const count = getStrikeCount(interaction.guildId, user.id);
      return interaction.reply({ content: `<@${user.id}> has **${count}** active strike(s).`, ephemeral: true });
    }
    if (sub === "clear") {
      clearStrikes(interaction.guildId, user.id);
      return interaction.reply({ content: `Cleared strikes for <@${user.id}>.`, ephemeral: true });
    }
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    const lines = rulesData.rules.map(
      (r) => `• \`${r.id}\` (${r.type}${r.enabled === false ? ", disabled" : ""}) — ${r.description}`
    );
    return interaction.reply({
      content: lines.length ? lines.join("\n") : "No rules configured.",
      ephemeral: true,
    });
  }

  if (sub === "add") {
    const id = interaction.options.getString("id", true);
    const type = interaction.options.getString("type", true);
    const pattern = interaction.options.getString("pattern", true);
    const description = interaction.options.getString("description") ?? id;

    const existing = rulesData.rules.find((r) => r.id === id);
    if (existing) {
      existing.patterns.push(pattern);
    } else {
      rulesData.rules.push({ id, description, type, patterns: [pattern], enabled: true });
    }
    await saveRules(rulesData);
    rulesData = await loadRules();
    return interaction.reply({ content: `Saved rule \`${id}\`.`, ephemeral: true });
  }

  if (sub === "remove") {
    const id = interaction.options.getString("id", true);
    const before = rulesData.rules.length;
    rulesData.rules = rulesData.rules.filter((r) => r.id !== id);
    if (rulesData.rules.length === before) {
      return interaction.reply({ content: `No rule with id \`${id}\`.`, ephemeral: true });
    }
    await saveRules(rulesData);
    rulesData = await loadRules();
    return interaction.reply({ content: `Removed rule \`${id}\`.`, ephemeral: true });
  }

  if (sub === "reload") {
    rulesData = await loadRules();
    return interaction.reply({ content: "Reloaded rules from file.", ephemeral: true });
  }
});

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}. Loaded ${rulesData._compiled.length} active rule group(s).`);
  // On hosted platforms there's no shell step to run `npm run register`, so set
  // REGISTER_ON_START=true to (idempotently) register slash commands at boot.
  if (process.env.REGISTER_ON_START === "true") {
    try {
      const where = await registerCommands({
        token: TOKEN,
        clientId: c.user.id,
        guildId: process.env.GUILD_ID,
      });
      console.log(`Registered slash commands ${where}.`);
    } catch (err) {
      console.warn("Slash command registration failed:", err.message);
    }
  }
});

client.login(TOKEN);
