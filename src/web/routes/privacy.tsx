import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy · Senda" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-12 sm:px-8">
      <a href="/" aria-label="Senda home" className="w-fit"><Brand className="h-10" /></a>
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="text-sm text-muted-foreground">Updated 28 October 2026</p>
        <p className="leading-relaxed">
          Senda is operated by Hanif Carroll. It stores process transcripts, supporting evidence,
          and separate As-is and To-be diagrams so you can review and revise them with your own agent.
        </p>
      </header>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your account</h2>
        <p className="leading-relaxed">
          Email sign-in uses your email address and a single-use link. Google sign-in gives Senda
          your Google account identifier, name, email address, email verification status, and profile
          picture. Senda stores account and authentication records, including the tokens returned
          during Google sign-in, to authenticate you and connect sign-in methods to the same account.
          It requests only basic identity permissions, without access to Gmail, Drive, or Calendar.
          Google account data is not sold or used for advertising.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your process and its history</h2>
        <p className="leading-relaxed">
          Senda stores the sources you add, clarification answers, process models, saved revisions,
          and agent permissions. Projects are private to your account and the agents you authorize.
          Earlier revisions remain stored so you can inspect how the model changed. Closing your
          browser or removing a Google connection does not delete your Senda account or project history.
          There is currently no automatic expiry for accounts or projects.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your connected agent</h2>
        <p className="leading-relaxed">
          An agent can read or update the projects you approve. Sources and models it reads are
          shared with that agent and its provider.
          Disconnecting agents prevents further access through those connections; it cannot remove
          information an agent has already received. Your agent provider has its own privacy and
          retention practices.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The Senda agent</h2>
        <p className="leading-relaxed">
          When you use the built-in Senda agent, your messages and relevant process sources and
          models are sent to DeepSeek to draft or revise your diagrams. Conversations and usage
          records are saved with your account on Cloudflare so you can continue the work later.
          API credentials remain on the server. DeepSeek processes these requests under its own
          privacy and retention practices.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Hosting, email, and cookies</h2>
        <p className="leading-relaxed">
          The hosted app runs on Cloudflare. Account and permission records are stored in Cloudflare
          D1, and project snapshots are stored in a private Cloudflare R2 bucket. Cloudflare Email
          Service delivers sign-in messages. Google processes authentication when you choose Google
          sign-in. These services process information needed to deliver the app, such as network
          requests and email delivery details. Authentication records can include IP addresses and
          browser information. Operational logs help diagnose errors; request query strings are redacted.
        </p>
        <p className="leading-relaxed">
          Senda uses cookies to keep you signed in and complete authentication. It does not use
          advertising cookies or embed advertising trackers.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Access, correction, and deletion</h2>
        <p className="leading-relaxed">
          You can download diagrams from your projects. For access to your account data, corrections,
          or deletion of your account and project history, contact{" "}
          <a className="underline underline-offset-4" href="mailto:hanifcarroll@gmail.com">
            hanifcarroll@gmail.com
          </a>{" "}
          using your account email. Deletion requests are handled manually and require verification
          of account ownership. Copies already exported or received by an agent are held separately
          from Senda. You can also remove Senda’s Google connection in your Google Account settings.
        </p>
      </section>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Changes to these practices will be reflected on this page with an updated date.
      </p>
    </main>
  );
}
