const DEFAULT_TEMPLATE =
  `👋 *Welcome, {user}!*\n\n` +
  `Glad to have you in *{group}* — you're member #{count}.\n` +
  `Type {prefix}help to see what I can do, and you've already earned your first badge below 👇`;

/**
 * Fill a welcome-message template with real values. Supports {user}, {group},
 * {count}, {prefix} placeholders — falls back to a sensible default if no
 * custom template is set for the group.
 */
export function composeWelcomeMessage(template, { userMention, groupName, memberCount, prefix }) {
  const text = template || DEFAULT_TEMPLATE;
  return text
    .replaceAll('{user}', userMention)
    .replaceAll('{group}', groupName)
    .replaceAll('{count}', String(memberCount))
    .replaceAll('{prefix}', prefix);
}

export { DEFAULT_TEMPLATE };
