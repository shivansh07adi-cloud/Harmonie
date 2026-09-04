// Central registry: each command module exports { names: string[], description, usage, category, run(ctx) }
import * as general from './commands/general.js';
import * as stickers from './commands/stickers.js';
import * as media from './commands/media.js';
import * as info from './commands/info.js';
import * as group from './commands/group.js';
import * as reminder from './commands/reminder.js';
import * as system from './commands/system.js';
import * as socialDownload from './commands/socialDownload.js';
import * as badges from './commands/badges.js';
import * as badgeAdmin from './commands/badgeAdmin.js';
import * as quiz from './commands/quiz.js';

const modules = [general, stickers, media, info, group, reminder, system, socialDownload, badges, badgeAdmin, quiz];

const commandMap = new Map();
const allCommands = [];

for (const mod of modules) {
  for (const cmd of mod.commands) {
    allCommands.push(cmd);
    for (const name of cmd.names) {
      commandMap.set(name.toLowerCase(), cmd);
    }
  }
}

export function findCommand(name) {
  return commandMap.get(name.toLowerCase());
}

export function listCommands() {
  return allCommands;
}
