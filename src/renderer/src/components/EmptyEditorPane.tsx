export function EmptyEditorPane({ defaultFolder, onCreate }: { defaultFolder: string; onCreate: () => void }) {
  return (
    <main className="informio-editor-shell flex min-w-0 flex-1 items-center justify-center overflow-hidden px-6">
      <button
        type="button"
        onClick={onCreate}
        className="max-w-full break-all rounded-md px-3 py-2 text-center text-[15px] font-semibold text-slate-400 transition-[background-color,color,transform] active:scale-95 hover:bg-slate-500/5 hover:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
      >
        Create in {defaultFolder}
      </button>
    </main>
  );
}
