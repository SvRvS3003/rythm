import type { BrowserContext } from 'playwright';
export const MUTE_ARGS = ['--mute-audio'];
export async function silence(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { this.muted = true; return play.apply(this, arguments as never); };
  });
}
