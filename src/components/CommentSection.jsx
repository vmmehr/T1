import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useComment } from '../context/CommentContext';
import styles from './CommentSection.module.css';

const toNormalizedVisibility = (value) => (value === 'internal' ? 'staff_private' : value);

const CommentSection = ({
    decisionId,
    targetItemId = null,
    section = 'general',
    compact = false,
    forcePublic = false,
    newCount = null
}) => {
    const { currentUser } = useAuth();
    const { getComments, addComment, markTaskCommentsRead, markItemCommentsRead, getThreadSeenCount, markThreadSeen } = useComment();
    const [newComment, setNewComment] = useState('');
    const [submitError, setSubmitError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const markReadKeyRef = useRef('');
    const isTaskThread = section === 'task' && Boolean(targetItemId);
    const isDecisionItemThread = section !== 'task' && Boolean(targetItemId);
    const hasExplicitUnreadCount = typeof newCount === 'number';

    const defaultVisibility = forcePublic
        ? 'public'
        : (['psychologist', 'supervisor'].includes(currentUser?.role) ? 'psychologist_private' : 'public');
    const [visibility, setVisibility] = useState(defaultVisibility);
    const [isExpanded, setIsExpanded] = useState(!compact);
    const visibilityGroupName = `visibility-${decisionId}-${section}-${targetItemId || 'main'}`;
    const threadKey = `${currentUser?.id || 'anonymous'}-${decisionId}-${section}-${targetItemId || 'main'}`;

    useEffect(() => {
        setVisibility(defaultVisibility);
    }, [defaultVisibility]);

    useEffect(() => {
        if (!isExpanded || newCount <= 0) return;

        const shouldMarkTask = isTaskThread;
        const shouldMarkDecisionItem = isDecisionItemThread && hasExplicitUnreadCount;
        if (!shouldMarkTask && !shouldMarkDecisionItem) return;

        const currentKey = `${decisionId}-${section}-${targetItemId}-${newCount}`;
        if (markReadKeyRef.current === currentKey) return;
        markReadKeyRef.current = currentKey;
        if (shouldMarkTask) {
            markTaskCommentsRead(decisionId, targetItemId).catch((error) => {
                console.error('Error marking task comments as read:', error);
            });
            return;
        }
        markItemCommentsRead(decisionId, targetItemId).catch((error) => {
            console.error('Error marking decision item comments as read:', error);
        });
    }, [
        decisionId,
        targetItemId,
        section,
        newCount,
        isTaskThread,
        isDecisionItemThread,
        hasExplicitUnreadCount,
        isExpanded,
        markTaskCommentsRead,
        markItemCommentsRead
    ]);

    const allComments = getComments(decisionId);

    const relevantComments = allComments.filter(c => {
        if (targetItemId) {
            if (section === 'task') {
                return c.task_id === targetItemId;
            }
            return c.target_item_id === targetItemId;
        }

        return c.target_item_id === null &&
            (c.task_id === null || c.task_id === undefined) &&
            (c.section === section || (!c.section && section === 'general'));
    });

    const visibleComments = relevantComments.filter(c => {
        if (currentUser?.role === 'client') {
            return toNormalizedVisibility(c.visibility) === 'public';
        }
        return true;
    });
    const seenCount = hasExplicitUnreadCount ? 0 : getThreadSeenCount(threadKey);

    useEffect(() => {
        if (hasExplicitUnreadCount) return;
        if (seenCount === undefined) {
            markThreadSeen(threadKey, visibleComments.length);
            return;
        }
        if (!isExpanded || seenCount === visibleComments.length) return;
        markThreadSeen(threadKey, visibleComments.length);
    }, [hasExplicitUnreadCount, isExpanded, seenCount, markThreadSeen, threadKey, visibleComments.length]);

    const inlineUnreadCount = hasExplicitUnreadCount
        ? Math.max(Number(newCount) || 0, 0)
        : (seenCount === undefined ? 0 : Math.max(visibleComments.length - seenCount, 0));
    const shouldShowInlineBubble = !isTaskThread && inlineUnreadCount > 0;

    if (compact && !isExpanded) {
        const buttonLabel = visibleComments.length === 0 ? 'افزودن یادداشت' : `${visibleComments.length} یادداشت`;
        return (
            <button
                onClick={() => setIsExpanded(true)}
                className={`${styles.expandButton} ${visibleComments.length > 0 ? styles.expandButtonWithCount : ''}`}
            >
                <span className={styles.expandButtonIconWrap}>
                    <span>💬</span>
                    {shouldShowInlineBubble && (
                        <span className={styles.expandButtonUnreadBubble}>
                            {inlineUnreadCount}
                        </span>
                    )}
                </span>
                {buttonLabel}
            </button>
        );
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || isSubmitting) return;

        let finalVisibility = forcePublic ? 'public' : visibility;
        if (currentUser?.role === 'client') finalVisibility = 'public';

        setSubmitError('');
        setIsSubmitting(true);
        try {
            await addComment(decisionId, newComment, targetItemId, finalVisibility, section);
            setNewComment('');
        } catch (error) {
            setSubmitError(error?.message || 'Could not save the comment.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isConsultant = currentUser?.role === 'consultant';
    const isStaff = isConsultant || ['psychologist', 'supervisor'].includes(currentUser?.role);
    const sectionTitle = targetItemId
        ? 'یادداشت‌ها'
        : section === 'outcome_reflection'
            ? 'یادداشت‌های تحلیل شکست'
            : 'یادداشت‌های کلی تصمیم';

    return (
        <div className={`comment-section ${styles.commentSection} ${compact ? styles.commentSectionCompact : styles.commentSectionExpanded}`}>
            <div className={styles.header}>
                <h4 className={styles.title}>
                    {sectionTitle}
                </h4>
                {shouldShowInlineBubble && !compact && (
                    <span className={styles.titleUnreadBubble}>
                        {inlineUnreadCount}
                    </span>
                )}
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
                {visibleComments.map(comment => {
                    const normalizedVisibility = toNormalizedVisibility(comment.visibility);
                    const badgeText = normalizedVisibility === 'staff_private'
                        ? 'Private (staff)'
                        : normalizedVisibility === 'psychologist_private'
                            ? 'Private (psychologist)'
                            : null;

                    return (
                        <div key={comment.id} className={`${styles.comment} ${normalizedVisibility !== 'public' ? styles.commentInternal : styles.commentPublic}`}>
                            <div className={styles.commentHeader}>
                                <span>{comment.profiles?.full_name || 'نامشخص'}</span>
                                <span className={styles.commentMeta}>
                                    <span>{new Date(comment.created_at).toLocaleDateString('fa-IR')}</span>
                                    {badgeText && (
                                        <span className={styles.commentBadge}>{badgeText}</span>
                                    )}
                                </span>
                            </div>
                            <div className={styles.commentContent}>{comment.content}</div>
                        </div>
                    );
                })}
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
                    onChange={(e) => {
                        setNewComment(e.target.value);
                        if (submitError) setSubmitError('');
                    }}
                    placeholder="نوشتن یادداشت..."
                    rows={2}
                    disabled={isSubmitting}
                />
                <div className={styles.formFooter}>
                    {forcePublic && isStaff ? (
                        <div className={styles.visibilityInfo}>
                            دیدگاه در این بخش عمومی است و مراجع آن را می‌بیند.
                        </div>
                    ) : !forcePublic && isStaff ? (
                        <div className={styles.visibilityOptions}>
                            <label className={styles.visibilityLabel}>
                                <input
                                    type="radio"
                                    name={visibilityGroupName}
                                    value="public"
                                    checked={visibility === 'public'}
                                    onChange={() => setVisibility('public')}
                                />
                                عمومی (مراجع می‌بیند)
                            </label>
                            <label className={styles.visibilityLabel}>
                                <input
                                    type="radio"
                                    name={visibilityGroupName}
                                    value="staff_private"
                                    checked={visibility === 'staff_private'}
                                    onChange={() => setVisibility('staff_private')}
                                />
                                فقط تیم درمان
                            </label>
                            <label className={styles.visibilityLabel}>
                                <input
                                    type="radio"
                                    name={visibilityGroupName}
                                    value="psychologist_private"
                                    checked={visibility === 'psychologist_private'}
                                    onChange={() => setVisibility('psychologist_private')}
                                />
                                فقط روانشناس
                            </label>
                        </div>
                    ) : !forcePublic ? (
                        <div className={styles.visibilityInfo}>
                            {currentUser?.role === 'client' ? 'قابل مشاهده برای مشاور' : 'محرمانه'}
                        </div>
                    ) : null}

                    <button type="submit" className="btn btn-sm btn-primary" disabled={!newComment.trim() || isSubmitting}>
                        ارسال
                    </button>
                </div>
                {submitError && (
                    <div className={styles.submitError}>
                        {submitError}
                    </div>
                )}
            </form>
        </div>
    );
};

export default CommentSection;
