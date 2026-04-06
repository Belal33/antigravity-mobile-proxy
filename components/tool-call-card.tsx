'use client';

const TOOL_ICONS: Record<string, string> = {
  command: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  read: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  browser: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  mcp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/><circle cx="12" cy="12" r="4"/></svg>',
};

const PERMISSION_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

function getStatusClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'permission required') return 'permission';
  if (s.startsWith('running') || s.startsWith('editing') || s.startsWith('creating') || s.startsWith('search')) return 'running';
  if (s.startsWith('ran') || s.startsWith('edited') || s.startsWith('created') || s.startsWith('read') || s.startsWith('viewed') || s.startsWith('analyzed') || s.startsWith('wrote') || s.startsWith('replaced') || s.startsWith('deleted')) return 'done';
  if (s.includes('error') || s.includes('fail')) return 'error';
  if (s.startsWith('mcp')) return 'mcp';
  return 'running';
}

function getButtonStyle(btnText: string): string {
  const lower = btnText.toLowerCase();
  if (lower === 'deny' || lower === 'block' || lower === 'reject') return 'permission-btn deny';
  if (lower === 'allow' || lower === 'allow once' || lower === 'allow this conversation') return 'permission-btn allow';
  return 'tool-footer-btn';
}

interface ToolCallCardProps {
  data: Record<string, any>;
  onAction?: (toolId: string, buttonText: string) => void;
}

export default function ToolCallCard({ data, onAction }: ToolCallCardProps) {
  const statusClass = getStatusClass(data.status);
  const isPermission = statusClass === 'permission';
  const iconHtml = isPermission ? PERMISSION_ICON : (TOOL_ICONS[data.type] || TOOL_ICONS.file);

  const handleAction = async (btn: string) => {
    if (onAction) {
      onAction(data.id, btn);
      return;
    }
    try {
      await fetch('/api/v1/chat/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId: data.id, buttonText: btn }),
      });
    } catch { /* ignore */ }
  };

  if (isPermission) {
    return (
      <div className="permission-card" data-tool-index={data.index}>
        <div className="permission-header">
          <span className="permission-icon" dangerouslySetInnerHTML={{ __html: PERMISSION_ICON }} />
          <span className="permission-title">Permission Required</span>
        </div>
        {data.path ? (
          <div className="permission-description">
            The agent needs access to: <code className="permission-path">{data.path}</code>
          </div>
        ) : (
          <div className="permission-description">
            The agent is requesting your approval to proceed.
          </div>
        )}
        {data.footerButtons && data.footerButtons.length > 0 && (
          <div className="permission-actions">
            {data.footerButtons.map((btn: string, i: number) => (
              <button
                key={i}
                className={getButtonStyle(btn)}
                onClick={() => handleAction(btn)}
              >
                {btn}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`tool-call-card ${statusClass}`} data-tool-index={data.index}>
      <div className="tool-header">
        <span className="tool-icon" dangerouslySetInnerHTML={{ __html: iconHtml }} />
        <span className="tool-status-text">{data.status}</span>
        {data.path && <span className="tool-path" title={data.path}>{data.path}</span>}
      </div>

      {data.command && (
        <div className="tool-command"><code>{data.command}</code></div>
      )}

      {(data.additions || data.deletions) && (
        <div className="tool-file-changes">
          {data.additions && <span className="tool-additions">{data.additions}</span>}
          {data.deletions && <span className="tool-deletions">{data.deletions}</span>}
        </div>
      )}

      {data.exitCode && <div className="tool-exit-code">{data.exitCode}</div>}

      {data.terminalOutput && (
        <div className="tool-terminal">{data.terminalOutput}</div>
      )}

      {data.footerButtons && data.footerButtons.length > 0 && (
        <div className="tool-footer-actions">
          {data.footerButtons.map((btn: string, i: number) => (
            <button key={i} className={getButtonStyle(btn)}
              onClick={() => handleAction(btn)}
            >
              {btn}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
