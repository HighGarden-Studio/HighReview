import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface PendingComment {
  id: string;
  file: string;
  line: number;
  body: string;
  isAI?: boolean;
  createdAt: number;
}

interface SubmitReviewParams {
  event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
  body?: string;
}

export function usePendingReview(owner: string, repo: string, prNumber: number) {
  const [comments, setComments] = useState<PendingComment[]>([]);
  const queryClient = useQueryClient();
  const storageKey = `pending-review-${owner}-${repo}-${prNumber}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setComments(JSON.parse(stored));
      }
    } catch (error) {
      console.error('[usePendingReview] Failed to load from localStorage:', error);
    }
  }, [storageKey]);

  // Save to localStorage whenever comments change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(comments));
    } catch (error) {
      console.error('[usePendingReview] Failed to save to localStorage:', error);
    }
  }, [comments, storageKey]);

  const addComment = useCallback(
    (file: string, line: number, body: string, isAI?: boolean) => {
      const newComment: PendingComment = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        line,
        body,
        isAI,
        createdAt: Date.now(),
      };
      setComments(prev => [...prev, newComment]);
    },
    []
  );

  const updateComment = useCallback((id: string, body: string) => {
    setComments(prev =>
      prev.map(comment => (comment.id === id ? { ...comment, body } : comment))
    );
  }, []);

  const removeComment = useCallback((id: string) => {
    setComments(prev => prev.filter(comment => comment.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComments([]);
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('[usePendingReview] Failed to clear localStorage:', error);
    }
  }, [storageKey]);

  const submitReviewMutation = useMutation({
    mutationFn: async ({ event, body }: SubmitReviewParams) => {
      const response = await fetch(`/api/prs/${owner}/${repo}/${prNumber}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event,
          body: body || '',
          comments: comments.map(c => ({
            path: c.file,
            line: c.line,
            body: c.body,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit review');
      }

      return response.json();
    },
    onSuccess: () => {
      // Clear pending comments
      clearAll();
      // Invalidate PR conversation cache to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['pr-conversation', owner, repo, prNumber] });
    },
  });

  const submitReview = useCallback(
    async (event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES', body?: string) => {
      await submitReviewMutation.mutateAsync({ event, body });
    },
    [submitReviewMutation]
  );

  return {
    comments,
    addComment,
    updateComment,
    removeComment,
    clearAll,
    submitReview,
    isSubmitting: submitReviewMutation.isPending,
    submitError: submitReviewMutation.error as Error | null,
  };
}
