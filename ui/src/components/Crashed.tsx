import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from './ui/Button';

// What shows when a part of the studio fails to render, in its place, instead of a blank page: what
// happened, the error, and a way out. `whole`: the app itself failed (reload); otherwise a screen
// failed and the rest of the studio stays (try again, or go Home). `resetKey` clears the failure when
// the person moves to another screen.
interface Props { children: ReactNode; whole?: boolean; resetKey?: string | null }
interface State { error: Error | null; key: string | null | undefined }

export class Crashed extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error('[studio] a screen failed to render', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { whole } = this.props;
    return (
      <div role="alert" className={whole ? 'flex min-h-screen items-center justify-center bg-canvas p-6' : 'mx-auto max-w-2xl px-6 py-16'}>
        <div className="flex max-w-xl flex-col items-start gap-3">
          <TriangleAlert className="size-6 text-warn" aria-hidden />
          <h1 className="text-lg font-semibold">{whole ? 'The studio could not show itself' : 'This screen could not be shown'}</h1>
          <p className="text-sm text-fg-muted">Something in what the bot sent did not read as expected. Nothing was lost: the bot keeps running.</p>
          <code className="block w-full overflow-x-auto rounded-md bg-sunken px-3 py-2 font-mono text-xs text-fg-muted">{error.message}</code>
          <div className="flex gap-2">
            {whole
              ? <Button variant="primary" onClick={() => location.reload()}>Reload</Button>
              : <>
                <Button variant="primary" onClick={() => this.setState({ error: null })}>Try again</Button>
                <Button onClick={() => { location.hash = ''; }}>Go Home</Button>
              </>}
          </div>
        </div>
      </div>
    );
  }
}
