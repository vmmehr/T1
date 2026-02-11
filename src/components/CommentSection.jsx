import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useComment } from '../context/CommentContext';
import styles from './CommentSection.module.css';

const CommentSection = ({ decisionId, targetItemId = null, section = 'general', compact = false }) => {
    const { currentUser } = useAuth();
    const { getComments, addComment } = useComment();
    const [newComment, setNewComment] = useState('');

    // Default visibility: Internal for Psych/Sup, Public for Consultant (can change), Public for Client
    const defaultVisibility = ['psychologist', 'supervisor'].includes(currentUser?.role) ? 'internal' : 'public';
    const [visibility, setVisibility] = useState(defaultVisibility);
    const [isExpanded, setIsExpanded] = useState(!compact);

    const allComments = getComments(decisionId);

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
                className={styles.expandButton}
            >
                افزودن یادداشت
            </button>
        );
    }

    if (compact && !isExpanded) {
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className={`${styles.expandButton} ${styles.expandButtonWithCount}`}
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

    const isConsultant = currentUser?.role === 'consultant';

    return (
        <div className={`comment-section ${styles.commentSection} ${compact ? styles.commentSectionCompact : styles.commentSectionExpanded}`}>
            <div className={styles.header}>
                <h4 className={styles.title}>
                    {targetItemId ? 'یادداشت‌ها' : 'یادداشت‌های کلی تصمیم'}
                </h4>
                {compact && (
                    <button
                        onClick={() => setIsExpanded(false)}
                        className={styles.closeButton}
                    >
                        −
                    </button>
                )}
            </div>

            <div className={styles.commentsList}>
                {visibleComments.map(comment => (
                    <div key={comment.id} className={`${styles.comment} ${comment.visibility === 'internal' ? styles.commentInternal : styles.commentPublic}`}>
                        <div className={styles.commentHeader}>
                            <span>{comment.profiles?.full_name || 'نامشخص'}</span>
                            <span className={styles.commentMeta}>
                                <span>{new Date(comment.created_at).toLocaleDateString('fa-IR')}</span>
                                {comment.visibility === 'internal' && (
                                    <span className={styles.commentBadge}>محرمانه</span>
                                )}
                            </span>
                        </div>
                        <div className={styles.commentContent}>{comment.content}</div>
                    </div>
                ))}
                {visibleComments.length === 0 && (
                    <div className={styles.emptyComments}>
                        هیچ یادداشتی وجود ندارد.
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
                <textarea
                    className={`input-field ${styles.textarea}`}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="نوشتن یادداشت..."
                    rows={2}
                />
                <div className={styles.formFooter}>
                    {isConsultant || ['psychologist', 'supervisor'].includes(currentUser?.role) ? (
                        <div className={styles.visibilityOptions}>
                            <label className={styles.visibilityLabel}>
                                <input
                                    type="radio"
                                    name={`visibility-${targetItemId || 'main'}`}
                                    value="public"
                                    checked={visibility === 'public'}
                                    onChange={() => setVisibility('public')}
                                />
                                عمومی (مراجع می‌بیند)
                            </label>
                            <label className={styles.visibilityLabel}>
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
                        <div className={styles.visibilityInfo}>
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
