export interface User {
  id: string;
  name: string;
  handle: string;
  color: string;
}

export interface Post {
  id: string;
  authorId: string;
  content: string;
  createdAt: number;
  likes: string[];
  repostCount: number;
}

export interface Reply {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: number;
}
