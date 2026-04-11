export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  dateStr: string;
  author: string;
  content: string;
}

export interface BlogPostSummary {
  slug: string;
  title: string;
  dateStr: string;
  author: string;
}
