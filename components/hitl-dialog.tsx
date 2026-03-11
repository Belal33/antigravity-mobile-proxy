'use client';

interface HITLDialogProps {
  onApprove: () => void;
  onReject: () => void;
}

export default function HITLDialog({ onApprove, onReject }: HITLDialogProps) {
  return (
    <div className="hitl-dialog">
      <div className="hitl-label">⚠️ Needs Approval</div>
      <div className="hitl-context">The agent needs your permission to proceed.</div>
      <div className="hitl-actions">
        <button className="hitl-approve-btn" onClick={onApprove}>
          ✓ Approve
        </button>
        <button className="hitl-reject-btn" onClick={onReject}>
          ✕ Reject
        </button>
      </div>
    </div>
  );
}
