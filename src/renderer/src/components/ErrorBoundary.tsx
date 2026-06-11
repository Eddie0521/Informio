import { Component, type ReactNode } from "react";
import i18n from "../i18n";

type Props = {
  name: string;
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.name}] Error:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-[13px] font-semibold text-slate-600">{i18n.t("errorBoundary.componentLoadFailed", { name: this.props.name })}</p>
          <p className="max-w-md text-[12px] text-slate-400">{this.state.error?.message}</p>
          <button
            type="button"
            className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            {i18n.t("errorBoundary.retry")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
