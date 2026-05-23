import { OrganicGradientBackground } from './components/OrganicGradientBackground';

export default function Home() {
  return (
    <main>
      <OrganicGradientBackground>
        <section className="mx-auto flex max-w-4xl flex-col items-center px-6 text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-white/80 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Powered by Google Gemini
          </span>

          <h1 className="text-balance text-5xl font-semibold tracking-tight text-white sm:text-6xl md:text-7xl">
            Gemini, made simple.
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            A clean, fast wrapper around Google&apos;s most capable models.
            No setup. No clutter. Just answers.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <a
              href="#start"
              className="inline-flex h-11 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition hover:bg-white/90"
            >
              Start chatting
            </a>
            <a
              href="#learn-more"
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/10"
            >
              Learn more
            </a>
          </div>
        </section>
      </OrganicGradientBackground>
    </main>
  );
}
