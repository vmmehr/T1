import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDecision } from '../context/DecisionContext';

const CommentSection = ({ decisionId, targetItemId = null, section = 'general', compact = false }) => {
    const { currentUser } = useAuth();
    const { getComments, addComment } = useDecision();
    const [newComment, setNewComment] = useState('');

    // Default visibility: Internal for Psych/Sup, Public for Consultant (can change), Public for Client
    const defaultVisibility = ['psychologist', 'supervisor'].includes(currentUser?.role) ? 'internal' : 'public';
    const [visibility, setVisibility] = useState(defaultVisibility);

    // Reset visibility when role changes or component remounts if needed
    // React.useEffect(() => { setVisibility(defaultVisibility) }, [currentUser]);
    const [isExpanded, setIsExpanded] = useState(!compact);

    const allComments = getComments(decisionId);

    // Filter comments based on targetItemId and Section
    // Filter comments based on targetItemId and Section
    const relevantComments = allComments.filter(c => {
        // If targetItemId is provided:
        if (targetItemId) {
            // If section is 'task', we MUST match against task_id
            if (section === 'task') {
                return c.task_id === targetItemId;
            }
            // Otherwise match against target_item_id (for pros/cons)
            return c.target_item_id === targetItemId;
        }

        // If no targetItemId, match section (and ensure db comment has no target_item_id AND no task_id)
        // This ensures we don't show task-specific comments in the general strategy list
        // interacting with old records or if column is missing, task_id might be undefined.
        return c.target_item_id === null &&
            (c.task_id === null || c.task_id === undefined) &&
            (c.section === section || (!c.section && section === 'general'));
    });

    // Filter visibility based on role
    // Client sees: 'public'
    // Others see: ALL
    const visibleComments = relevantComments.filter(c => {
        if (currentUser?.role === 'client') {
            return c.visibility === 'public';
        }
        return true;
    });

    if (compact && !isExpanded && visibleComments.length === 0) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    padding: 0,
                    marginTop: '0.5rem',
                    textDecoration: 'underline'
                }}
            >
                افزودن یادداشت
            </button>
        );
    }

    if (compact && !isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    padding: 0,
                    marginTop: '0.5rem'
                }}
            >
                💬 {visibleComments.length} یادداشت
            </button>
        );
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        if (newComment.trim()) {
            // Determine actual visibility
            // If Client: Force Public
            // If Psych/Sup: Force Internal (as per requirement "only seen by consultant")
            // If Consultant: User selection (default Public)

            // If Client: Force Public
            // If Others: Respect 'visibility' state (defaulted below)
            let finalVisibility = visibility;
            if (currentUser?.role === 'client') finalVisibility = 'public';

            // Pass 'section' logic
            addComment(decisionId, newComment, targetItemId, finalVisibility, section);
            setNewComment('');
        }
    };

    const isStaff = ['consultant', 'psychologist', 'supervisor'].includes(currentUser?.role);
    const isConsultant = currentUser?.role === 'consultant';

    return (
        <div className="comment-section" style={{
            marginTop: '1rem',
            background: compact ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.4)',
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                    {targetItemId ? 'یادداشت‌ها' : 'یادداشت‌های کلی تصمیم'}
                </h4>
                {compact && (
                    <button
                        onClick={() => setIsExpanded(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
                    >
                        −
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                {visibleComments.map(comment => (
                    <div key={comment.id} style={{
                        background: comment.visibility === 'internal' ? '#fffbeb' : 'white',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--color-border)',
                        borderRight: comment.visibility === 'internal' ? '3px solid #f59e0b' : '3px solid var(--color-primary)',
                        fontSize: '0.9rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            <span>{comment.profiles?.full_name || 'نامشخص'}</span>
                            <span style={{ display: 'flex', gap: '0.5rem' }}>
                                <span>{new Date(comment.created_at).toLocaleDateString('fa-IR')}</span>
                                {comment.visibility === 'internal' && (
                                    <span style={{
                                        background: '#f59e0b',
                                        color: 'white',
                                        padding: '0 4px',
                                        borderRadius: '4px',
                                        fontSize: '0.7rem'
                                    }}>محرمانه</span>
                                )}
                            </span>
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{comment.content}</div>
                    </div>
                ))}
                {visibleComments.length === 0 && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                        هیچ یادداشتی وجود ندارد.
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit}>
                <textarea
                    className="input-field"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="نوشتن یادداشت..."
                    rows={2}
                    style={{ fontSize: '0.9rem', marginBottom: '0.5rem', background: 'white' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                    {isConsultant || ['psychologist', 'supervisor'].includes(currentUser?.role) ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name={`visibility-${targetItemId || 'main'}`}
                                    value="public"
                                    checked={visibility === 'public'}
                                    onChange={() => setVisibility('public')}
                                />
                                عمومی (مراجع می‌بیند)
                            </label>
                            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                <input
                                    type="radio"
                                    name={`visibility-${targetItemId || 'main'}`}
                                    value="internal"
                                    checked={visibility === 'internal'}
                                    onChange={() => setVisibility('internal')}
                                />
                                محرمانه
                            </label>
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {currentUser?.role === 'client' ? 'قابل مشاهده برای مشاور' : 'محرمانه'}
                        </div>
                    )}

                    <button type="submit" className="btn btn-sm btn-primary" disabled={!newComment.trim()}>
                        ارسال
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CommentSection;
