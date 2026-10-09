import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { CloseIcon, PlusIcon } from '@/components/icons';
import { Button } from '@/components/primitives';
import { useToast } from '@/components/Toast';

import {
  rewardTasksApi,
  type RewardTask,
  type RewardTaskMediaInput,
  type RewardTaskSubmitPayload,
  type RewardTasksResponse,
} from '../../api/rewardTasks';
import { ticketsApi } from '../../api/tickets';
import {
  describeUserTaskError,
  parseRewardTaskError,
  planPhotoUpload,
  REWARD_PHOTO_ACCEPT,
  REWARD_TASK_LIMITS,
  shouldLeaveTasksPage,
  STALE_TASK_ERROR_CODES,
  toSubmissionMedia,
  withTaskStatus,
  type RewardTaskErrorText,
} from '../../utils/rewardTasks';
import { useLeaveTasksPage } from './useLeaveTasksPage';
import { useTaskErrorText } from './useTaskErrorText';

interface PhotoAttachment {
  id: string;
  name: string;
  preview: string;
  uploading: boolean;
  media?: RewardTaskMediaInput;
  failed?: boolean;
}

interface PhotoReportFormProps {
  task: RewardTask;
  onClose: () => void;
}

function makeAttachmentId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `att_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Фотоотчёт по заданию: 1..max_photos скриншотов + комментарий. Загрузка —
 * как в тикетах: каждый файл сразу уходит в /cabinet/media/upload, в отчёт
 * попадают только file_id (и превью для списка в админке).
 */
export function PhotoReportForm({ task, onClose }: PhotoReportFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const errorText = useTaskErrorText();
  const leavePage = useLeaveTasksPage();
  const [attachments, setAttachments] = useState<PhotoAttachment[]>([]);
  const [comment, setComment] = useState('');
  const [notices, setNotices] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<RewardTaskErrorText | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Загрузки, завершившиеся после закрытия формы, игнорируем
  const uploadIdRef = useRef(0);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const uploadRef = uploadIdRef;
    const urls = blobUrlsRef;
    return () => {
      uploadRef.current++;
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  const maxPhotos = task.max_photos;

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const plan = planPhotoUpload(files, attachments.length, maxPhotos);
    const messages = plan.rejected.map(({ file, reason }) => {
      if (reason === 'type') return t('rewardTasks.photo.badType', { name: file.name });
      if (reason === 'size') return t('rewardTasks.photo.tooLarge', { name: file.name });
      return t('rewardTasks.photo.limit', { max: maxPhotos });
    });
    setNotices([...new Set(messages)]);
    setSubmitError(null);

    const uploadToken = uploadIdRef.current;
    for (const file of plan.accepted) {
      const id = makeAttachmentId();
      const preview = URL.createObjectURL(file);
      blobUrlsRef.current.add(preview);
      setAttachments((prev) => [...prev, { id, name: file.name, preview, uploading: true }]);

      (async () => {
        try {
          const result = await ticketsApi.uploadMedia(file, 'photo');
          if (uploadIdRef.current !== uploadToken) return;
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, uploading: false, media: toSubmissionMedia(result) } : a,
            ),
          );
        } catch (err) {
          if (uploadIdRef.current !== uploadToken) return;
          // Загрузка общая с тикетами; если и она ответит, что раздел скрыт, — уходим
          if (shouldLeaveTasksPage(parseRewardTaskError(err), 'action')) {
            leavePage();
            return;
          }
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, uploading: false, failed: true } : a)),
          );
        }
      })();
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.preview);
        blobUrlsRef.current.delete(removed.preview);
      }
      return prev.filter((a) => a.id !== id);
    });
    setNotices([]);
  };

  const submitMutation = useMutation({
    mutationFn: (payload: RewardTaskSubmitPayload) =>
      rewardTasksApi.submitPhotoReport(task.id, payload),
    onSuccess: () => {
      showToast({ type: 'success', message: t('rewardTasks.photo.submitted') });
      queryClient.setQueryData<RewardTasksResponse>(['reward-tasks'], (prev) =>
        withTaskStatus(prev, task.id, 'pending'),
      );
      queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
      onClose();
    },
    onError: (err: unknown) => {
      const parsed = parseRewardTaskError(err);
      // Раздел скрыли, пока форма была открыта, — уходим, как и со списка
      if (shouldLeaveTasksPage(parsed, 'action')) {
        leavePage();
        return;
      }
      setSubmitError(describeUserTaskError(parsed));
      if (parsed.code && STALE_TASK_ERROR_CODES.includes(parsed.code)) {
        queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
      }
    },
  });

  const readyMedia = attachments.flatMap((a) => (a.media ? [a.media] : []));
  const isUploading = attachments.some((a) => a.uploading);
  const hasFailed = attachments.some((a) => a.failed);
  const canSubmit =
    readyMedia.length > 0 &&
    readyMedia.length <= maxPhotos &&
    !isUploading &&
    !hasFailed &&
    !submitMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSubmitError(null);
    const trimmed = comment.trim();
    submitMutation.mutate({ media: readyMedia, ...(trimmed ? { comment: trimmed } : {}) });
  };

  const commentId = `reward-task-comment-${task.id}`;

  return (
    <div className="space-y-3 rounded-xl border border-dark-700/50 bg-dark-800/30 p-3 sm:p-4">
      <p className="text-sm text-dark-300">{t('rewardTasks.photo.hint', { max: maxPhotos })}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept={REWARD_PHOTO_ACCEPT}
        multiple={maxPhotos > 1}
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {attachments.map((att) => (
          <div
            key={att.id}
            className="relative aspect-square overflow-hidden rounded-lg border border-dark-700 bg-dark-800"
          >
            <img src={att.preview} alt={att.name} className="h-full w-full object-cover" />
            {att.uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-dark-950/50">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              </div>
            )}
            {att.failed && (
              <div className="absolute inset-0 flex items-end bg-error-500/30 p-1">
                <span className="w-full rounded bg-dark-950/70 px-1 py-0.5 text-center text-2xs text-error-300">
                  {t('rewardTasks.photo.uploadFailed')}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => removeAttachment(att.id)}
              aria-label={t('rewardTasks.photo.remove')}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-dark-950/70 text-dark-100 transition-colors hover:bg-error-500 hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}

        {attachments.length < maxPhotos && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-dark-600 text-dark-400 transition-colors hover:border-accent-500/50 hover:text-accent-400"
          >
            <PlusIcon className="h-6 w-6" />
            <span className="px-1 text-center text-xs leading-tight">
              {t('rewardTasks.photo.add')}
            </span>
          </button>
        )}
      </div>

      <div className="text-xs text-dark-500">
        {t('rewardTasks.photo.counter', { current: attachments.length, max: maxPhotos })}
      </div>

      {notices.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs text-warning-400">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor={commentId} className="label">
          {t('rewardTasks.photo.comment')}
        </label>
        <textarea
          id={commentId}
          className="input min-h-[72px] resize-y"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={REWARD_TASK_LIMITS.commentMax}
          placeholder={t('rewardTasks.photo.commentPlaceholder')}
        />
      </div>

      {hasFailed && <p className="text-xs text-error-400">{t('rewardTasks.photo.removeFailed')}</p>}

      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-sm text-error-400"
        >
          {errorText(submitError)}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          disabled={submitMutation.isPending}
        >
          {t('common.cancel')}
        </Button>
        <Button
          className="flex-1"
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={submitMutation.isPending}
        >
          {t('rewardTasks.photo.submit')}
        </Button>
      </div>
    </div>
  );
}
