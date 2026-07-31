import type { AttachmentViewData } from "@/components/pad/attachments/types";

export type CommentAuthor = {
  id: string;
  name: string | null;
  image: string | null;
  mentionable?: boolean;
};

export type CommentMentionCandidate = {
  id: string;
  name: string;
};

export type ThreadCommentData = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  updatedAt?: string;
  mentionedUserIds?: string[];
  attachments?: AttachmentViewData[];
  author: CommentAuthor;
};
