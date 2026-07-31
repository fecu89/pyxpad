import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

export function PostBody({ body }: { body: string }) {
  return <div className="markdown-body"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{body}</ReactMarkdown></div>;
}
