// What `botid/client/core` and `botid/server` resolve to in an app that has
// not installed `botid`, an optional peer: the build wires no BotID then
// (`runtimeConfig.public.backend.botDetection` is false), so neither runs.

/** BotID's client, absent: nothing to start. */
export function initBotId(_options: unknown): void {}

/** BotID's server check, absent: the gate never asks it, and a call refuses. */
export async function checkBotId(): Promise<never> {
  throw new Error('botid is not installed: install it for the bot check on Vercel (npm install botid).')
}
