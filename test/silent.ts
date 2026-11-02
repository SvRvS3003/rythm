// TypeScript, test/silent.ts, node + playwright: every browser test goes through here, so no test ever makes a sound on the machine.
import type { BrowserContext } from 'playwright';
export const MUTE_ARGS = ['--mute-audio'];
export async function silence(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { this.muted = true; return play.apply(this, arguments as never); };
  });
}
