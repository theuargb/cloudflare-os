import { Component, type ReactNode } from "react";
import { reportIssue } from "./error-reporting";

export default class ErrorBoundary extends Component<{children: ReactNode}, {crashed: boolean}> {
  state = {crashed: false};
  static getDerivedStateFromError() { return {crashed: true}; }
  componentDidCatch(error: Error) { reportIssue("database.react-render", error,
    {handled: false, severity: "fatal", captureMechanism: "react"}); }
  render() {
    if (!this.state.crashed) return this.props.children;
    return <main className="shell"><div className="state"><h1>Something went wrong</h1>
      <button onClick={() => location.reload()}>Reload</button></div></main>;
  }
}
