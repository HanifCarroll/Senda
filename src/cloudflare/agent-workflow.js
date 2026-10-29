import { WorkflowEntrypoint } from 'cloudflare:workers';

export class SendaAgentWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // Provider calls and model writes are not blindly replayable. The DB claim
    // is an additional guard against a repeated Workflow delivery.
    return step.do('prepare-and-save-agent-reply', {
      retries: { limit: 0, delay: '1 second' }, timeout: '10 minutes',
    }, async () => {
      const [{ HostedAgent }, { CloudProjects }] = await Promise.all([
        import('./agent.js'), import('./projects.js'),
      ]);
      const projects = new CloudProjects(this.env.DB, this.env.SNAPSHOTS, {
        reviewVersion: process.env.SENDA_REVIEW_VERSION,
      });
      const origin = this.env.LOCAL_EMAIL_OUTBOX === '1' &&
        ['127.0.0.1', 'localhost'].includes(new URL(event.payload.origin).hostname)
        ? event.payload.origin : this.env.APP_URL;
      return new HostedAgent(this.env, projects, origin)
        .execute(event.payload);
    });
  }
}
