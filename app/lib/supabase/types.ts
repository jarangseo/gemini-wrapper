export type ConversationRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};
